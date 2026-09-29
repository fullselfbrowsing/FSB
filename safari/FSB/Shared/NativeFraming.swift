//
//  NativeFraming.swift
//  FSB — shared by the container app and the Safari web extension target.
//
//  Wire codec between extension/ws/mcp-native-transport.js and the native host.
//  Safari caps a single native message near 1 MB, and FSB routinely exceeds
//  that (read_page full:true, get_dom_snapshot with a large max_elements), so
//  oversized payloads are chunked.
//
//  Chunking is UTF-8 -> base64 -> slice, never slice-then-encode: base64 is
//  pure ASCII, so a chunk boundary can never split a multi-byte sequence or a
//  surrogate pair. That entire class of corruption is designed out rather than
//  guarded against.
//

import Foundation

enum NativeFraming {

    static let protocolVersion = 1
    /// Conservative default. The real ceiling is measured on-device and
    /// re-advertised to the extension in the `opened` frame.
    static let defaultMaxFrameBytes = 512 * 1024
    static let maxReassemblyBytes = 32 * 1024 * 1024
    static let reassemblyTimeout: TimeInterval = 30

    struct ChunkBuffer {
        var parts: [String?]
        var received: Int
        var bytes: Int
        var startedAt: Date
    }

    enum IngestResult {
        case complete(String)
        case pending
        case ignored
        case failed(String)
    }

    // MARK: - Outbound (host -> extension)

    /// Split one MCP JSON string into frames the extension can reassemble.
    static func encode(_ payload: String, seq: Int, maxFrameBytes: Int) -> [[String: Any]] {
        let byteCount = payload.utf8.count
        if byteCount <= maxFrameBytes {
            return [["v": protocolVersion, "t": "frame", "seq": seq, "data": payload]]
        }

        let b64 = Data(payload.utf8).base64EncodedString()
        let cid = UUID().uuidString
        var frames: [[String: Any]] = []
        var index = 0
        var cursor = b64.startIndex
        let total = Int(ceil(Double(b64.count) / Double(maxFrameBytes)))

        while cursor < b64.endIndex {
            let end = b64.index(cursor, offsetBy: maxFrameBytes, limitedBy: b64.endIndex) ?? b64.endIndex
            frames.append([
                "v": protocolVersion,
                "t": "chunk",
                "seq": seq + index,
                "cid": cid,
                "i": index,
                "n": total,
                "enc": "b64",
                "data": String(b64[cursor..<end])
            ])
            cursor = end
            index += 1
        }
        return frames
    }

    // MARK: - Inbound (extension -> host)

    /// Accumulate an inbound frame/chunk. Returns the complete payload once all
    /// parts of a chunked message have arrived.
    ///
    /// Reassembly is bounded on BOTH size and time. A stalled reassembly must
    /// never sit silently: the corresponding sendAndWait on the server would
    /// hang until its own 30s timeout, and that timeout string is not one of
    /// the bridge-disconnect messages, so the sw_evicted recovery would never
    /// arm. Failing loudly turns a permanent hang into a fast reconnect.
    static func ingest(_ msg: [String: Any], into buffers: inout [String: ChunkBuffer]) -> IngestResult {
        guard let type = msg["t"] as? String else { return .ignored }

        if type == "frame" {
            guard let data = msg["data"] as? String else { return .ignored }
            return .complete(data)
        }

        guard type == "chunk",
              let cid = msg["cid"] as? String,
              let i = msg["i"] as? Int,
              let n = msg["n"] as? Int,
              n > 0, i >= 0, i < n
        else { return .ignored }

        let data = msg["data"] as? String ?? ""

        var buf = buffers[cid] ?? ChunkBuffer(parts: Array(repeating: nil, count: n),
                                              received: 0, bytes: 0, startedAt: Date())

        if Date().timeIntervalSince(buf.startedAt) > reassemblyTimeout {
            buffers.removeValue(forKey: cid)
            return .failed("reassembly_timeout")
        }

        if buf.parts.indices.contains(i), buf.parts[i] == nil {
            buf.parts[i] = data
            buf.received += 1
            buf.bytes += data.utf8.count
        }

        if buf.bytes > maxReassemblyBytes {
            buffers.removeValue(forKey: cid)
            return .failed("reassembly_overflow")
        }

        if buf.received == n {
            buffers.removeValue(forKey: cid)
            let joined = buf.parts.compactMap { $0 }.joined()
            if (msg["enc"] as? String) == "b64" {
                guard let decoded = Data(base64Encoded: joined),
                      let str = String(data: decoded, encoding: .utf8)
                else { return .failed("reassembly_decode_failed") }
                return .complete(str)
            }
            return .complete(joined)
        }

        buffers[cid] = buf
        return .pending
    }
}
