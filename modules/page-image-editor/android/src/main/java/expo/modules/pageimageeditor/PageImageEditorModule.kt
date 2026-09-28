// 保存済みのページの画像を四隅で台形補正し、回転・縮小して JPEG に書き出す（Android。ADR 0023、詳細設計書 9.12）。
// Matrix.setPolyToPoly（四隅 → 長方形）で Canvas に描く。
package expo.modules.pageimageeditor

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class PageImageEditorModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PageImageEditor")

    // AsyncFunction は JS スレッド外で動くため、重い画像処理でも画面を止めない
    AsyncFunction("correctPageImage") { sourceUri: String, edit: PageEditRecord, options: CorrectOptionsRecord ->
      correct(sourceUri, edit, options)
    }
  }

  private fun correct(sourceUri: String, edit: PageEditRecord, options: CorrectOptionsRecord): Map<String, Any> {
    if (edit.corners.size != 4) throw InvalidEditException("corners must have 4 points")
    if (edit.rotation !in listOf(0, 90, 180, 270)) {
      throw InvalidEditException("rotation must be 0, 90, 180 or 270")
    }

    val uri = Uri.parse(sourceUri)
    val source = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
      ?: throw ImageLoadException(sourceUri)
    try {
      // 外部で置かれた画像にも対応するため、EXIF の向きを反映した見た目の向きで扱う
      val orientation = context.contentResolver.openInputStream(uri)?.use {
        ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      } ?: ExifInterface.ORIENTATION_NORMAL
      val matrix = exifMatrix(orientation)
      val oriented = RectF(0f, 0f, source.width.toFloat(), source.height.toFloat())
      matrix.mapRect(oriented)
      matrix.postTranslate(-oriented.left, -oriented.top)

      // 相対座標（左上原点）→ 見た目の向きの px。左上・右上・右下・左下の順
      val corners = edit.corners.map { floatArrayOf((it.x * oriented.width()).toFloat(), (it.y * oriented.height()).toFloat()) }
      val (topLeft, topRight, bottomRight, bottomLeft) = corners

      // 台形を長方形に広げたときの自然な大きさ。長辺を maxEdge に収める（拡大はしない）
      val naturalWidth = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2
      val naturalHeight = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2
      if (naturalWidth < 1 || naturalHeight < 1) throw InvalidEditException("the quadrilateral is too small")
      val shrink = min(1.0, options.maxEdge / max(naturalWidth, naturalHeight))
      val width = max(1, (naturalWidth * shrink).roundToInt())
      val height = max(1, (naturalHeight * shrink).roundToInt())

      // 台形補正・縮小・右回りの回転を1つの変換にまとめ、大きな画像のコピーを1回で済ませる。
      // 長方形の四隅（左上・右上・右下・左下）を、右に rotation だけ回した出力画像上の位置に置く
      val w = width.toFloat()
      val h = height.toFloat()
      val (outputWidth, outputHeight, destination) = when (edit.rotation) {
        90 -> Triple(height, width, floatArrayOf(h, 0f, h, w, 0f, w, 0f, 0f))
        180 -> Triple(width, height, floatArrayOf(w, h, 0f, h, 0f, 0f, w, 0f))
        270 -> Triple(height, width, floatArrayOf(0f, w, 0f, 0f, h, 0f, h, w))
        else -> Triple(width, height, floatArrayOf(0f, 0f, w, 0f, w, h, 0f, h))
      }
      val perspective = Matrix()
      val sourcePoints = corners.flatMap { it.asList() }.toFloatArray()
      if (!perspective.setPolyToPoly(sourcePoints, 0, destination, 0, 4)) {
        throw InvalidEditException("perspective correction failed")
      }
      matrix.postConcat(perspective)

      val output = Bitmap.createBitmap(outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
      try {
        Canvas(output).drawBitmap(source, matrix, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        val file = writeJpeg(output, options.quality)
        return mapOf(
          "uri" to Uri.fromFile(file).toString(),
          "width" to outputWidth,
          "height" to outputHeight
        )
      } finally {
        output.recycle()
      }
    } finally {
      source.recycle()
    }
  }

  private fun writeJpeg(bitmap: Bitmap, quality: Double): File {
    val directory = File(appContext.cacheDirectory, "PageImageEditor")
    val file = File(directory, "${UUID.randomUUID()}.jpg")
    try {
      directory.mkdirs()
      FileOutputStream(file).use {
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, (quality * 100).roundToInt().coerceIn(0, 100), it)) {
          throw ImageWriteException("JPEG encoding failed")
        }
      }
    } catch (e: java.io.IOException) {
      throw ImageWriteException(e.message ?: e.toString())
    }
    return file
  }
}

/** 保存されたままの画素 → 見た目の向き への変換（EXIF の向き 1〜8） */
private fun exifMatrix(orientation: Int): Matrix = Matrix().apply {
  when (orientation) {
    ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
    ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
    ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
    ExifInterface.ORIENTATION_TRANSPOSE -> {
      setRotate(90f)
      postScale(-1f, 1f)
    }
    ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
    ExifInterface.ORIENTATION_TRANSVERSE -> {
      setRotate(-90f)
      postScale(-1f, 1f)
    }
    ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(-90f)
  }
}

private fun distance(a: FloatArray, b: FloatArray): Double =
  hypot((a[0] - b[0]).toDouble(), (a[1] - b[1]).toDouble())

class PointRecord : Record {
  @Field
  val x: Double = 0.0

  @Field
  val y: Double = 0.0
}

class PageEditRecord : Record {
  @Field
  val corners: List<PointRecord> = emptyList()

  @Field
  val rotation: Int = 0
}

class CorrectOptionsRecord : Record {
  @Field
  val maxEdge: Double = 0.0

  @Field
  val quality: Double = 1.0
}

internal class ImageLoadException(uri: String) :
  CodedException(message = "Could not read the image: $uri")

internal class InvalidEditException(detail: String) :
  CodedException(message = "Invalid page edit: $detail")

internal class ImageWriteException(detail: String) :
  CodedException(message = "Could not write the corrected image: $detail")
