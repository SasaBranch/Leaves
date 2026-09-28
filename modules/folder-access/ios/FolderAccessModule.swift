// アプリの外のフォルダ（別の場所の本棚）へのアクセスと、iCloud のダウンロードの依頼（ADR 0025、詳細設計書 9.13）。
// iOS では、選んだフォルダに再起動後もアクセスするにはブックマークを保存し、開くたびに解決してアクセスを始める必要がある。
// expo-file-system はこれを持たないため、ここで補う。
import ExpoModulesCore
import Foundation

public class FolderAccessModule: Module {
  // アクセス中の URL。stopAccessing を呼ぶまで保持し、アクセスを本棚を開いている間ずっと続ける（キーはパス）
  private var accessingUrls: [String: URL] = [:]
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("FolderAccess")

    // ブックマークの作成・解決は速いため同期関数にする
    Function("createBookmark") { (uri: String) throws -> String in
      let url = try self.fileUrl(from: uri)
      // 選んだ直後は expo-file-system がアクセスを始めたままなので、ブックマークを作れる
      let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
      return data.base64EncodedString()
    }

    Function("openBookmark") { (bookmark: String) -> [String: String]? in
      guard let data = Data(base64Encoded: bookmark) else { return nil }
      var isStale = false
      guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &isStale) else {
        // 許可切れ・見つからない。呼び出し側が「開けません」と示す（FR-L-04）
        return nil
      }
      let key = url.standardizedFileURL.path
      self.lock.lock()
      let alreadyAccessing = self.accessingUrls[key] != nil
      self.lock.unlock()
      var startedHere = false
      if !alreadyAccessing {
        // false でも（アクセス制限のない場所など）読めることがあるため、存在の確認で判断する
        startedHere = url.startAccessingSecurityScopedResource()
      }
      var isDirectory: ObjCBool = false
      guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), isDirectory.boolValue else {
        if startedHere { url.stopAccessingSecurityScopedResource() }
        return nil
      }
      if startedHere {
        self.lock.lock()
        self.accessingUrls[key] = url
        self.lock.unlock()
      }
      // フォルダが移動・名前変更されるとブックマークが古くなる。作り直して保存してもらう
      var result = ["uri": url.absoluteString]
      if isStale, let refreshed = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
        result["refreshedBookmark"] = refreshed.base64EncodedString()
      }
      return result
    }

    Function("stopAccessing") { (uri: String) in
      guard let url = try? self.fileUrl(from: uri) else { return }
      let key = url.standardizedFileURL.path
      self.lock.lock()
      let accessing = self.accessingUrls.removeValue(forKey: key)
      self.lock.unlock()
      accessing?.stopAccessingSecurityScopedResource()
    }

    Function("isUbiquitous") { (uri: String) -> Bool in
      guard let url = try? self.fileUrl(from: uri) else { return false }
      let values = try? url.resourceValues(forKeys: [.isUbiquitousItemKey])
      return values?.isUbiquitousItem ?? false
    }

    Function("startDownloading") { (uri: String) -> String? in
      do {
        let url = try self.fileUrl(from: uri)
        try FileManager.default.startDownloadingUbiquitousItem(at: url)
        return nil
      } catch {
        // ダウンロードの依頼は次の反映の機会にもう一度行うため、失敗しても呼び出し側を止めない
        return error.localizedDescription
      }
    }
  }

  // expo-file-system の uri は URL の absoluteString（パーセントエンコード済み）。URL(string:) で戻す
  private func fileUrl(from uri: String) throws -> URL {
    if let url = URL(string: uri), url.isFileURL {
      return url
    }
    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }
    throw InvalidFileUriException(uri)
  }
}

private final class InvalidFileUriException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "ファイルの URI ではありません: \(param)"
  }
}
