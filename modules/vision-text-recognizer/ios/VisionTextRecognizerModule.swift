// Apple Vision による端末内の文字認識（iOS。ADR 0013）。
// 画像は外部に送信しない（FR-O-03）。行ごとの文字と、画像上の位置（左上原点の px）を返す。
import ExpoModulesCore
import UIKit
import Vision

public class VisionTextRecognizerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionTextRecognizer")

    AsyncFunction("recognize") { (uri: URL, promise: Promise) in
      guard let image = UIImage(contentsOfFile: uri.path), let cgImage = image.cgImage else {
        promise.reject("ERR_IMAGE_LOAD", "画像を読み込めませんでした: \(uri.path)")
        return
      }
      let imageWidth = Double(cgImage.width)
      let imageHeight = Double(cgImage.height)

      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          promise.reject("ERR_RECOGNITION", error.localizedDescription)
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        let lines: [[String: Any]] = observations.compactMap { observation in
          guard let candidate = observation.topCandidates(1).first else { return nil }
          // Vision の座標は 0〜1 の左下原点。ML Kit（Android）と同じ左上原点の px にそろえる
          let box = observation.boundingBox
          return [
            "text": candidate.string,
            "frame": [
              "left": box.minX * imageWidth,
              "top": (1 - box.maxY) * imageHeight,
              "width": box.width * imageWidth,
              "height": box.height * imageHeight,
            ],
          ]
        }
        let text = lines.compactMap { $0["text"] as? String }.joined(separator: "\n")
        promise.resolve(["text": text, "lines": lines])
      }
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["ja-JP", "en-US"]
      request.usesLanguageCorrection = true

      // 認識は重いため、JS スレッドや UI スレッドを止めないよう別のキューで行う
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cgImage, orientation: image.cgImageOrientation, options: [:])
            .perform([request])
        } catch {
          promise.reject("ERR_RECOGNITION", error.localizedDescription)
        }
      }
    }
  }
}

private extension UIImage {
  // 撮影時の向き（EXIF）を Vision に伝え、横倒しのまま認識しないようにする
  var cgImageOrientation: CGImagePropertyOrientation {
    switch imageOrientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
