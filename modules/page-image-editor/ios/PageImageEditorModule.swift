// 保存済みのページの画像を四隅で台形補正し、回転・縮小して JPEG に書き出す（iOS。ADR 0023、詳細設計書 9.12）。
// Core Image の CIPerspectiveCorrection を使う。
import CoreImage
import ExpoModulesCore

public class PageImageEditorModule: Module {
  // CIContext は作るのが重く、スレッドセーフなので使い回す
  private static let context = CIContext()

  public func definition() -> ModuleDefinition {
    Name("PageImageEditor")

    // AsyncFunction は JS スレッド外のキューで動くため、重い画像処理でも画面を止めない
    AsyncFunction("correctPageImage") { (sourceUri: URL, edit: PageEditRecord, options: CorrectOptionsRecord) -> [String: Any] in
      guard edit.corners.count == 4 else {
        throw InvalidEditException("corners must have 4 points")
      }
      // 外部で置かれた画像にも対応するため、EXIF の向きを反映した見た目の向きで扱う
      guard let image = CIImage(contentsOf: sourceUri, options: [.applyOrientationProperty: true]) else {
        throw ImageLoadException(sourceUri.absoluteString)
      }
      let imageWidth = image.extent.width
      let imageHeight = image.extent.height
      // 相対座標（左上原点）→ px。読み込んだ画像の extent の原点は (0, 0)
      let corners = edit.corners.map {
        CGPoint(x: $0.x * imageWidth, y: $0.y * imageHeight)
      }
      let (topLeft, topRight, bottomRight, bottomLeft) = (corners[0], corners[1], corners[2], corners[3])

      // 台形を長方形に広げたときの自然な大きさ。長辺を maxEdge に収める（拡大はしない）
      let naturalWidth = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2
      let naturalHeight = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2
      guard naturalWidth >= 1, naturalHeight >= 1 else {
        throw InvalidEditException("the quadrilateral is too small")
      }
      let shrink = min(1, CGFloat(options.maxEdge) / max(naturalWidth, naturalHeight))
      let outputWidth = max(1, (naturalWidth * shrink).rounded())
      let outputHeight = max(1, (naturalHeight * shrink).rounded())

      // Core Image の座標は左下原点なので y を反転する
      func vector(_ point: CGPoint) -> CIVector {
        CIVector(x: point.x, y: imageHeight - point.y)
      }
      let corrected = image.applyingFilter("CIPerspectiveCorrection", parameters: [
        "inputTopLeft": vector(topLeft),
        "inputTopRight": vector(topRight),
        "inputBottomRight": vector(bottomRight),
        "inputBottomLeft": vector(bottomLeft),
      ])
      let correctedExtent = corrected.extent
      guard !correctedExtent.isInfinite, correctedExtent.width > 0, correctedExtent.height > 0 else {
        throw InvalidEditException("perspective correction failed")
      }

      // CIPerspectiveCorrection の出力の大きさはフィルタが決めるため、上で求めた大きさに合わせて縮める。
      // 端の画素が透明とまざって暗くならないよう、外側を端の色で延ばしてから縮め、切り抜く
      let scaleY = outputHeight / correctedExtent.height
      let scaleX = outputWidth / correctedExtent.width
      let resized = corrected
        .transformed(by: CGAffineTransform(translationX: -correctedExtent.minX, y: -correctedExtent.minY))
        .clampedToExtent()
        .applyingFilter("CILanczosScaleTransform", parameters: [
          kCIInputScaleKey: scaleY,
          kCIInputAspectRatioKey: scaleX / scaleY,
        ])
        .cropped(to: CGRect(x: 0, y: 0, width: outputWidth, height: outputHeight))

      // oriented(_:) は「その向きで保存された画像を正しく表示する」変換をかける。
      // .right（EXIF 6）は、iPhone を縦に持って撮った写真のように「右に 90° 回して表示する」向きなので、
      // 右回り 90° = .right、180° = .down、右回り 270°（左回り 90°）= .left になる
      // （見た目の左上の点が .right で右上へ移ることを確認済み）
      let rotated: CIImage
      switch edit.rotation {
      case 0: rotated = resized
      case 90: rotated = resized.oriented(.right)
      case 180: rotated = resized.oriented(.down)
      case 270: rotated = resized.oriented(.left)
      default: throw InvalidEditException("rotation must be 0, 90, 180 or 270")
      }
      let output = rotated.transformed(
        by: CGAffineTransform(translationX: -rotated.extent.minX, y: -rotated.extent.minY))

      guard let cacheDirectory = appContext?.config.cacheDirectory else {
        throw ImageWriteException("cache directory is not available")
      }
      let directory = cacheDirectory.appendingPathComponent("PageImageEditor", isDirectory: true)
      let fileUrl = directory.appendingPathComponent("\(UUID().uuidString).jpg")
      let colorSpace = image.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB)!
      do {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Self.context.writeJPEGRepresentation(
          of: output,
          to: fileUrl,
          colorSpace: colorSpace,
          options: [
            CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): options.quality
          ])
      } catch {
        throw ImageWriteException(error.localizedDescription)
      }
      return [
        "uri": fileUrl.absoluteString,
        "width": Int(output.extent.width.rounded()),
        "height": Int(output.extent.height.rounded()),
      ]
    }
  }
}

private func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
  hypot(a.x - b.x, a.y - b.y)
}

struct PointRecord: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
}

struct PageEditRecord: Record {
  @Field var corners: [PointRecord] = []
  @Field var rotation: Int = 0
}

struct CorrectOptionsRecord: Record {
  @Field var maxEdge: Double = 0
  @Field var quality: Double = 1
}

final class ImageLoadException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Could not read the image: \(param)"
  }
}

final class InvalidEditException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Invalid page edit: \(param)"
  }
}

final class ImageWriteException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Could not write the corrected image: \(param)"
  }
}
