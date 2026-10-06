//
//  FileReadService.swift
//  FSB — shared by the container app and the Safari web extension target.
//
//  Reads a file for upload_file, but ONLY inside a folder the user granted (see
//  GrantedRoots). Safari native messaging caps a single message near 1 MB, so a
//  read is a handshake plus N chunk fetches rather than one response:
//
//      {t:"readFile",  path}          -> {ok, token, name, mime, size, chunks}
//      {t:"readChunk", token, i}      -> {ok, i, data(base64)}
//
//  Every failure is a TYPED reason string so the extension can surface
//  something actionable ("outside granted folders: ~/Downloads") instead of a
//  generic error.
//

import Foundation
import UniformTypeIdentifiers

final class FileReadService {

    static let shared = FileReadService()

    /// Base64 expands by 4/3, so the on-the-wire chunk is ~340 KB for this.
    /// Keep this divisible by three: every full slice is encoded independently,
    /// and padding is only valid at the end of the reassembled base64 string.
    static let chunkBytes = 255 * 1024
    /// Bound the whole feature. A larger upload would exhaust the service
    /// worker reassembling it long before the transport gave out.
    static let maxFileBytes = 32 * 1024 * 1024
    static let handleTTL: TimeInterval = 120

    private struct Handle {
        let data: Data
        let name: String
        let mime: String
        let createdAt: Date
    }

    private let queue = DispatchQueue(label: "com.fullselfbrowsing.fsb.fileread")
    private var handles: [String: Handle] = [:]

    private init() {}

    // MARK: - open

    func beginRead(path: String) -> [String: Any] {
        queue.sync {
            evictExpiredLocked()

            guard !path.isEmpty, path.hasPrefix("/") else {
                return fail("path_not_absolute")
            }

            guard let root = GrantedRoots.rootContaining(path) else {
                // Report only WHETHER anything is granted, never the granted
                // paths themselves. executeUploadFile deliberately keeps
                // filesystem structure out of results and audit records, and the
                // container app already lists the roots in its own UI.
                let granted = GrantedRoots.grantedPaths()
                return fail(granted.isEmpty ? "no_granted_folders" : "outside_granted_folders")
            }
            defer { root.url.stopAccessingSecurityScopedResource() }

            let url = URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL

            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), !isDir.boolValue else {
                return fail("not_a_file")
            }

            let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
            let size = (attrs?[.size] as? NSNumber)?.intValue ?? 0
            guard size <= Self.maxFileBytes else {
                return fail("file_too_large", detail: "\(size) > \(Self.maxFileBytes)")
            }

            // Read eagerly, never mapped: the handle outlives the security-scoped
            // access the defer above releases, so it must hold its own copy.
            guard let data = try? Data(contentsOf: url) else {
                return fail("read_failed")
            }

            let token = UUID().uuidString
            handles[token] = Handle(data: data,
                                    name: url.lastPathComponent,
                                    mime: Self.mimeType(for: url),
                                    createdAt: Date())

            let chunks = data.isEmpty ? 1 : Int(ceil(Double(data.count) / Double(Self.chunkBytes)))
            return [
                "v": NativeFraming.protocolVersion,
                "t": "readFileOk",
                "ok": true,
                "token": token,
                "name": url.lastPathComponent,
                "mime": Self.mimeType(for: url),
                "size": data.count,
                "chunks": chunks,
                "chunkBytes": Self.chunkBytes
            ]
        }
    }

    // MARK: - chunk

    func readChunk(token: String, index: Int) -> [String: Any] {
        queue.sync {
            evictExpiredLocked()
            guard let handle = handles[token] else { return fail("unknown_token") }

            let start = index * Self.chunkBytes
            guard index >= 0, start <= handle.data.count else { return fail("chunk_out_of_range") }
            let end = min(start + Self.chunkBytes, handle.data.count)
            let slice = handle.data.subdata(in: start..<end)

            let isLast = end >= handle.data.count
            if isLast { handles.removeValue(forKey: token) }

            return [
                "v": NativeFraming.protocolVersion,
                "t": "readChunkOk",
                "ok": true,
                "i": index,
                "last": isLast,
                "data": slice.base64EncodedString()
            ]
        }
    }

    func release(token: String) {
        queue.sync { _ = handles.removeValue(forKey: token) }
    }

    // MARK: - helpers

    private func evictExpiredLocked() {
        let cutoff = Date().addingTimeInterval(-Self.handleTTL)
        handles = handles.filter { $0.value.createdAt > cutoff }
    }

    private func fail(_ reason: String, detail: String? = nil) -> [String: Any] {
        var out: [String: Any] = [
            "v": NativeFraming.protocolVersion,
            "t": "readError",
            "ok": false,
            "reason": reason
        ]
        if let detail, !detail.isEmpty { out["detail"] = detail }
        return out
    }

    private static func mimeType(for url: URL) -> String {
        if let type = UTType(filenameExtension: url.pathExtension),
           let mime = type.preferredMIMEType {
            return mime
        }
        return "application/octet-stream"
    }
}
