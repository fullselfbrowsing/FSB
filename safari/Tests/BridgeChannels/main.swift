//
//  safari/Tests/BridgeChannels/main.swift
//
//  Drives the shipped BridgeCoordinator (Shared/*.swift) from a command-line
//  process, without Safari, against two local WebSocket servers: one standing
//  in for the MCP hub, one for the dashboard relay. Built and run by
//  tests/safari-native-bridge-channels.test.js, which starts the servers and
//  checks the JSON this prints.
//
//  Usage: BridgeChannelsHarness <mcp-ws-url> <relay-ws-url>
//

import Foundation

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    FileHandle.standardError.write("usage: BridgeChannelsHarness <mcp-url> <relay-url>\n".data(using: .utf8)!)
    exit(2)
}
let mcpURL = arguments[1]
let relayURL = arguments[2]
let origin = "safari-web-extension://00000000-0000-0000-0000-000000000000"

/// Waits for one callback, on a queue other than the coordinator's.
func waitFor<T>(timeout: TimeInterval = 10, _ start: (@escaping (T) -> Void) -> Void) -> T? {
    let done = DispatchSemaphore(value: 0)
    var value: T?
    start { result in
        value = result
        done.signal()
    }
    _ = done.wait(timeout: .now() + timeout)
    return value
}

/// Polls until a batch arrives (or a few holds pass) and returns its frames.
func poll(_ bridge: BridgeCoordinator) -> [String] {
    for _ in 0..<6 {
        guard let reply = waitFor({ done in bridge.handlePoll(waitMs: 1000) { done($0) } }) else { continue }
        if (reply["t"] as? String) == "batch", let frames = reply["frames"] as? [String], !frames.isEmpty {
            return frames
        }
    }
    return []
}

var report: [String: Any] = [:]

guard let mcp = BridgeCoordinator.forChannel("mcp"), let relay = BridgeCoordinator.forChannel("relay") else {
    print("{\"fatal\":\"known channel refused\"}")
    exit(1)
}
report["unknownChannelRefused"] = BridgeCoordinator.forChannel("bogus") == nil
report["sharedIsMcp"] = BridgeCoordinator.shared === mcp
report["channelsDistinct"] = mcp !== relay

let mcpOpen = waitFor { done in mcp.handleOpen(url: mcpURL, origin: origin) { done($0) } }
let relayOpen = waitFor { done in relay.handleOpen(url: relayURL, origin: origin) { done($0) } }
report["mcpOpen"] = mcpOpen?["t"] as? String ?? "timeout"
report["relayOpen"] = relayOpen?["t"] as? String ?? "timeout"

mcp.handleFrame(["v": NativeFraming.protocolVersion, "t": "frame", "seq": 1, "data": "ping-a"])
relay.handleFrame(["v": NativeFraming.protocolVersion, "t": "frame", "seq": 1, "data": "ping-b"])
report["mcpFrames"] = poll(mcp)
report["relayFrames"] = poll(relay)

// Closing one channel must leave the other's socket alone.
relay.handleClose(code: 1000, reason: "harness_relay_close")
mcp.handleFrame(["v": NativeFraming.protocolVersion, "t": "frame", "seq": 2, "data": "after-relay-close"])
report["mcpAfterRelayClose"] = poll(mcp)

// A closed channel dials a fresh socket instead of adopting anything.
let relayReopen = waitFor { done in relay.handleOpen(url: relayURL, origin: origin) { done($0) } }
report["relayReopen"] = relayReopen?["t"] as? String ?? "timeout"
report["relayReopenAdopted"] = relayReopen?["adopted"] as? Bool ?? false
relay.handleFrame(["v": NativeFraming.protocolVersion, "t": "frame", "seq": 2, "data": "ping-c"])
report["relayAfterReopen"] = poll(relay)

// The server closes the mcp socket while no poll is parked, so the `closed`
// is queued for a poll that never comes (the worker was evicted). A fresh
// `open` must not hand that stale `closed` to the new port as its first poll
// reply: the extension would hang up on a connection that had just opened.
mcp.handleFrame(["v": NativeFraming.protocolVersion, "t": "frame", "seq": 3, "data": "close-me"])
Thread.sleep(forTimeInterval: 1.0)
let mcpReopen = waitFor { done in mcp.handleOpen(url: mcpURL, origin: origin) { done($0) } }
report["mcpReopen"] = mcpReopen?["t"] as? String ?? "timeout"
report["mcpReopenAdopted"] = mcpReopen?["adopted"] as? Bool ?? false
let firstPoll = waitFor { done in mcp.handlePoll(waitMs: 500) { done($0) } }
report["mcpFirstPollAfterReopen"] = firstPoll?["t"] as? String ?? "timeout"
mcp.handleFrame(["v": NativeFraming.protocolVersion, "t": "frame", "seq": 4, "data": "after-reopen"])
report["mcpAfterReopen"] = poll(mcp)

mcp.handleClose(code: 1000, reason: "harness_done")
relay.handleClose(code: 1000, reason: "harness_done")

let json = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
print(String(data: json, encoding: .utf8)!)
// Give the close frames a moment to leave before the process exits.
Thread.sleep(forTimeInterval: 0.5)
exit(0)
