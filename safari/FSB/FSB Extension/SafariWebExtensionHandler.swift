//
//  SafariWebExtensionHandler.swift
//  FSB Extension
//
//  Native host for extension/ws/mcp-native-transport.js.
//
//  Safari delivers each port.postMessage as its own beginRequest(with:)
//  invocation, and the handler OBJECT is transient — so all durable state lives
//  in BridgeCoordinator.shared, which outlives individual invocations.
//
//  Two message types complete ASYNCHRONOUSLY and must park their context:
//    open — the reply must wait until the socket actually reaches :7225,
//           because the extension keys its onopen (and therefore its connection
//           id, staged-release cancel and in-flight task reconciliation) to
//           "server reachable", not "native port created".
//    poll — held open until frames arrive or the hold expires.
//
//  An NSExtensionContext may be completed exactly once, so every path below
//  goes through `complete`, which is guarded.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem

        let raw: Any?
        if #available(macOS 11.0, *) {
            raw = item?.userInfo?[SFExtensionMessageKey]
        } else {
            raw = item?.userInfo?["message"]
        }

        guard let msg = raw as? [String: Any], let type = msg["t"] as? String else {
            context.completeRequest(returningItems: nil)
            return
        }

        var completed = false
        let lock = NSLock()
        let complete: ([String: Any]?) -> Void = { payload in
            lock.lock()
            defer { lock.unlock() }
            guard !completed else { return }
            completed = true
            guard let payload else {
                context.completeRequest(returningItems: nil)
                return
            }
            let response = NSExtensionItem()
            if #available(macOS 11.0, *) {
                response.userInfo = [SFExtensionMessageKey: payload]
            } else {
                response.userInfo = ["message": payload]
            }
            context.completeRequest(returningItems: [response], completionHandler: nil)
        }

        switch type {
        case "open":
            let url = (msg["url"] as? String) ?? "ws://localhost:7225"
            BridgeCoordinator.shared.handleOpen(url: url) { reply in complete(reply) }

        case "frame", "chunk":
            BridgeCoordinator.shared.handleFrame(msg)
            complete(["v": NativeFraming.protocolVersion, "t": "ack"])

        case "poll":
            let waitMs = (msg["waitMs"] as? Int) ?? 5000
            BridgeCoordinator.shared.handlePoll(waitMs: waitMs) { reply in complete(reply) }

        case "close":
            let code = (msg["code"] as? Int) ?? 1000
            let reason = (msg["reason"] as? String) ?? "intentional"
            BridgeCoordinator.shared.handleClose(code: code, reason: reason)
            complete(["v": NativeFraming.protocolVersion, "t": "ack"])

        // upload_file. App Sandbox forbids reading arbitrary absolute paths, so
        // FileReadService only serves files inside a folder the user granted in
        // the container app. The extension has ALREADY run the sensitive-path
        // denylist + audit chokepoint before getting here; this is a second,
        // independent constraint, not a replacement for it.
        case "readFile":
            let path = (msg["path"] as? String) ?? ""
            complete(FileReadService.shared.beginRead(path: path))

        case "readChunk":
            let token = (msg["token"] as? String) ?? ""
            let index = (msg["i"] as? Int) ?? 0
            complete(FileReadService.shared.readChunk(token: token, index: index))

        case "readRelease":
            FileReadService.shared.release(token: (msg["token"] as? String) ?? "")
            complete(["v": NativeFraming.protocolVersion, "t": "ack"])

        case "grantStatus":
            complete(["v": NativeFraming.protocolVersion, "t": "grantStatus",
                      "ok": true, "roots": GrantedRoots.grantedPaths()])

        default:
            os_log(.default, "FSB native host: unknown message type %@", type)
            complete(nil)
        }
    }
}
