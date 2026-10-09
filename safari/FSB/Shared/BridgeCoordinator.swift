//
//  BridgeCoordinator.swift
//  FSB — shared by the container app and the Safari web extension target.
//
//  Owns the single MCPSocketSession and relays frames to/from the extension.
//
//  SOCKET LIFETIME IS SLAVED TO PORT LIFETIME — and that is deliberate.
//
//  The tempting design is to keep :7225 open across service-worker evictions.
//  Do not. If the socket survives, the MCP hub never observes a close, keeps
//  `connected = true`, and its sendAndWait sits until the 30s timeout, then
//  rejects with "Request ... timed out" — which is NOT in the server's
//  BRIDGE_DISCONNECT_MESSAGES set. So isBridgeDisconnectError() returns false
//  and the entire sw_evicted / partial_state recovery in the MCP tools never
//  arms. Closing the socket when the port drops keeps this transport
//  indistinguishable from a direct WebSocket at the server boundary, so the
//  existing recovery works unmodified.
//
//  THE LINGER. Closing instantly would be needlessly harsh for the common case
//  (SW killed, then revived ~200ms later by webNavigation.onCommitted). So a
//  disconnect starts a short linger; a new port arriving inside it ADOPTS the
//  live socket and skips the redial. The window sits well under the extension's
//  10s staged-agent-release grace, so an adopted reconnect still lands inside
//  it and the prior connection's staged release is cancelled normally.
//

import Foundation

final class BridgeCoordinator {

    static let shared = BridgeCoordinator()

    /// Deliberately shorter than the extension's RECONNECT_GRACE_MS (10s).
    static let lingerSeconds: TimeInterval = 3
    static let lingerBufferMaxFrames = 64
    static let lingerBufferMaxBytes = 4 * 1024 * 1024

    /// Silence that counts as "the port is gone".
    ///
    /// Safari hands the native side no port-teardown signal — every
    /// `port.postMessage` is just another `beginRequest`, and a disconnect is
    /// indistinguishable from quiet. But the extension keeps exactly ONE poll
    /// outstanding at all times and re-pumps it immediately on every reply
    /// (NATIVE_POLL_TIMEOUT_MS = 5000), so a gap with no poll parked and no
    /// inbound message is a sound disconnect proxy. This is the fallback
    /// safari/README.md V7 names.
    ///
    /// Worst case time-to-close is the tail of a held poll (5s) + this silence
    /// window + lingerSeconds, so ~13s. What that has to beat is the server's
    /// 30s sendAndWait timeout: close inside it and the hub sees a real
    /// disconnect and arms sw_evicted recovery, which is the whole point of
    /// slaving socket lifetime to port lifetime. It comfortably does.
    ///
    /// The fast-revive case never reaches any of this — a worker back in
    /// ~200ms sends `open` while the socket is still live and adopts it.
    static let portSilenceSeconds: TimeInterval = 5

    private let queue = DispatchQueue(label: "com.fullselfbrowsing.fsb.bridge")
    private var socket: MCPSocketSession?
    private var inbound: [String] = []
    private var reassembly: [String: NativeFraming.ChunkBuffer] = [:]
    private var seqOut = 0
    private var lingerTimer: DispatchSourceTimer?
    private var lingerBytes = 0
    private var maxFrameBytes = NativeFraming.defaultMaxFrameBytes

    /// A parked long-poll: the extension keeps exactly one outstanding, and we
    /// complete it when frames arrive or the hold expires.
    private var parkedPoll: (([String: Any]) -> Void)?
    private var pollTimer: DispatchSourceTimer?

    /// Control frames (`closed`, `error`) that arrived with no poll parked.
    /// They MUST be buffered rather than dropped: a lost `closed` leaves the
    /// extension long-polling a dead socket forever, since onclose never fires
    /// and nothing schedules a reconnect.
    private var pendingControl: [[String: Any]] = []

    /// The remaining chunks of ONE oversized inbound payload, already encoded
    /// and drained a chunk per poll reply. Held separately from `inbound`
    /// because these are finished wire frames, not raw MCP strings.
    private var pendingChunks: [[String: Any]] = []

    /// The `open` reply, parked until the socket actually reaches :7225. Held
    /// so a dial that fails (the MCP server simply isn't running — the common
    /// case) can answer it with a typed error instead of letting the extension
    /// burn its full 8s NATIVE_OPEN_TIMEOUT_MS.
    private var pendingOpenReply: (([String: Any]) -> Void)?

    private var lastContactAt = Date()
    private var watchdog: DispatchSourceTimer?

    private init() {}

    // MARK: - open

    func handleOpen(url: String, origin: String?, reply: @escaping ([String: Any]) -> Void) {
        queue.async {
            self.noteContact()
            // An `open` means a NEW port. Anything the previous port parked is
            // unanswerable, and must not be allowed to eat the frames buffered
            // during the linger — those belong to the port adopting them.
            self.retirePreviousPort()

            if let socket = self.socket, socket.state == .open {
                // Adoption: the SW was evicted and came back inside the linger.
                reply(["v": NativeFraming.protocolVersion, "t": "opened",
                       "adopted": true, "socketId": socket.socketId,
                       "maxFrameBytes": self.maxFrameBytes])
                self.flushToPoll()
                return
            }

            guard let parsed = URL(string: url) else {
                reply(["v": NativeFraming.protocolVersion, "t": "error",
                       "phase": "dial", "message": "invalid_url"])
                return
            }

            // A socket that never reached .open must not survive the new port.
            // Its callbacks are still attached, so it could answer the NEW
            // port's pendingOpenReply with a socket this coordinator no longer
            // references, and its eventual onClosed would set self.socket = nil
            // -- after which every handleFrame silently drops on
            // `self.socket?.send`. Reachable whenever a dial outlives the
            // extension's 8s NATIVE_OPEN_TIMEOUT_MS and it reconnects.
            if self.socket != nil { self.discardSocket(reason: "superseded_by_new_port") }
            // A server-side close nils the socket without passing through
            // discardSocket(), so half-built messages from that connection can
            // still be here. Left in place, the new socket's watchdog would
            // expire them and tear down a connection that did nothing wrong.
            self.reassembly.removeAll()

            let session = MCPSocketSession(url: parsed, origin: origin)
            self.socket = session
            self.pendingOpenReply = reply

            // Every callback re-checks that its session is still the current
            // one. discardSocket() nils the callbacks, but a block the old
            // session already queued (a dial failing just as the new `open`
            // lands) still runs afterwards -- and would otherwise nil the NEW
            // socket and answer the NEW port with the old dial's error.
            session.onOpen = { [weak self, weak session] socketId in
                guard let self else { return }
                self.queue.async {
                    guard let session, self.socket === session else { return }
                    self.noteContact()
                    guard let pending = self.pendingOpenReply else { return }
                    self.pendingOpenReply = nil
                    pending(["v": NativeFraming.protocolVersion, "t": "opened",
                             "adopted": false, "socketId": socketId,
                             "maxFrameBytes": self.maxFrameBytes])
                }
            }
            session.onText = { [weak self, weak session] text in
                guard let self else { return }
                self.queue.async {
                    guard let session, self.socket === session else { return }
                    self.enqueueInbound(text)
                }
            }
            session.onClosed = { [weak self, weak session] code, reason in
                guard let self else { return }
                self.queue.async {
                    guard let session, self.socket === session else { return }
                    self.socket = nil
                    self.stopWatchdog()
                    if let pending = self.pendingOpenReply {
                        // Died before it ever opened, so this is a dial failure,
                        // not a disconnect. Answering here is what turns "MCP
                        // server not running" from an 8s stall into a fast fail:
                        // the extension's _onPortMessage handles `error` by
                        // calling _fail() immediately.
                        self.pendingOpenReply = nil
                        pending(["v": NativeFraming.protocolVersion, "t": "error",
                                 "phase": "dial", "message": reason])
                        return
                    }
                    self.deliver(["v": NativeFraming.protocolVersion, "t": "closed",
                                  "code": code, "reason": reason])
                }
            }
            session.open()
            // discardSocket() above stops the silence watchdog; without this
            // the new socket would never get a linger/close on port silence.
            self.armWatchdog()
        }
    }

    // MARK: - extension -> server

    func handleFrame(_ msg: [String: Any]) {
        queue.async {
            self.noteContact()
            switch NativeFraming.ingest(msg, into: &self.reassembly) {
            case .complete(let payload):
                self.socket?.send(payload)
            case .failed(let reason):
                self.failReassembly(reason)
            case .pending, .ignored:
                break
            }
        }
    }

    /// A message that cannot be reassembled is a reply the server will never
    /// get. Telling only the extension is not enough: its reconnect would ADOPT
    /// this still-open socket (handleOpen), the hub would never see a close, and
    /// sendAndWait would sit out its 30s and reject with a timeout that does not
    /// arm sw_evicted recovery. Closing :7225 is what turns the lost message
    /// into a disconnect the server recovers from.
    private func failReassembly(_ reason: String) {
        discardSocket(reason: reason)
        deliver(["v": NativeFraming.protocolVersion, "t": "error",
                 "phase": "frame", "message": reason])
    }

    func handleClose(code: Int, reason: String) {
        queue.async {
            self.cancelLinger()
            self.retirePreviousPort()
            self.discardSocket(reason: reason)
        }
    }

    // MARK: - server -> extension (long poll)

    /// The extension keeps one poll outstanding at all times. Holding it open
    /// avoids depending on unsolicited host->extension push (whose support on
    /// Safari is the least certain part of this design) and doubles as the
    /// strongest available service-worker keepalive.
    func handlePoll(waitMs: Int, reply: @escaping ([String: Any]) -> Void) {
        queue.async {
            self.noteContact()
            if self.hasOutbound {
                reply(self.nextOutbound())
                return
            }
            // Data first, then control: frames queued before a close must still
            // reach the extension ahead of the close that followed them.
            if !self.pendingControl.isEmpty {
                reply(self.pendingControl.removeFirst())
                return
            }
            self.parkedPoll = reply
            let timer = DispatchSource.makeTimerSource(queue: self.queue)
            timer.schedule(deadline: .now() + .milliseconds(max(250, waitMs)))
            timer.setEventHandler { [weak self] in
                guard let self else { return }
                self.pollTimer = nil
                guard let parked = self.parkedPoll else { return }
                self.parkedPoll = nil
                // The port was waiting on us until now, so silence starts here,
                // not when this poll arrived. Otherwise a held 5s poll used up
                // the whole silence window, and every idle cycle armed a linger.
                self.lastContactAt = Date()
                parked(self.hasOutbound
                       ? self.nextOutbound()
                       : ["v": NativeFraming.protocolVersion, "t": "pollempty"])
            }
            timer.resume()
            self.pollTimer = timer
        }
    }

    private func enqueueInbound(_ text: String) {
        inbound.append(text)
        lingerBytes += text.utf8.count
        enforceLingerCap()
        flushToPoll()
    }

    private func flushToPoll() {
        guard hasOutbound, let parked = parkedPoll else { return }
        parkedPoll = nil
        pollTimer?.cancel()
        pollTimer = nil
        lastContactAt = Date()
        parked(nextOutbound())
    }

    /// Anything waiting to go to the extension, chunked or not.
    private var hasOutbound: Bool { !pendingChunks.isEmpty || !inbound.isEmpty }

    /// The next frame for a poll reply.
    ///
    /// One poll reply carries exactly one message, so an oversized payload is
    /// encoded ONCE into its full chunk sequence and drained one chunk per
    /// reply. The extension re-pumps immediately on every reply (see _pump in
    /// ws/mcp-native-transport.js), so the sequence drains at round-trip speed
    /// and _ingestChunk reassembles it on the far side.
    private func nextOutbound() -> [String: Any] {
        if !pendingChunks.isEmpty { return pendingChunks.removeFirst() }

        // A single payload over the frame ceiling can never be batched, so it
        // is chunked here. drainBatch() refuses to APPEND past the ceiling, but
        // it deliberately exempts the first frame -- otherwise an oversized head
        // would produce an empty batch forever -- which makes this branch the
        // only thing standing between such a head and Safari's per-message cap.
        // Encode BEFORE consuming: an empty result must fall through to
        // drainBatch with the payload still queued, not drop it on the floor.
        if let head = inbound.first, head.utf8.count > maxFrameBytes {
            let frames = NativeFraming.encode(head, seq: seqOut + 1, maxFrameBytes: maxFrameBytes)
            if !frames.isEmpty {
                inbound.removeFirst()
                lingerBytes = max(0, lingerBytes - head.utf8.count)
                seqOut += frames.count   // encode() stamps seq + index per chunk
                pendingChunks = Array(frames.dropFirst())
                return frames[0]
            }
        }

        return drainBatch()
    }

    private func drainBatch() -> [String: Any] {
        seqOut += 1
        var frames: [String] = []
        var bytes = 0
        while !inbound.isEmpty, frames.count < 8, bytes < 256 * 1024 {
            let next = inbound[0]
            // A frame past the per-message ceiling has to leave through
            // nextOutbound()'s chunk path, never inside a batch. Leaving it at
            // the head is what routes it there on the next poll.
            //
            // The !frames.isEmpty exemption is load-bearing: without it an
            // oversized HEAD would yield an empty batch while hasOutbound stays
            // true, and the extension would poll forever. An empty batch here is
            // impossible, so the head always reaches the chunk branch instead.
            if !frames.isEmpty, bytes + next.utf8.count > maxFrameBytes { break }
            inbound.removeFirst()
            bytes += next.utf8.count
            frames.append(next)
        }
        lingerBytes = max(0, lingerBytes - bytes)
        return ["v": NativeFraming.protocolVersion, "t": "batch",
                "seq": seqOut, "frames": frames, "more": hasOutbound]
    }

    /// Hand a control frame (`closed`, `error`) to the extension.
    ///
    /// BUFFERS when no poll is parked — it must never drop. There is always a
    /// round trip between us completing a `batch` and the extension's next
    /// `poll` landing, and a server close inside that window is exactly when
    /// this gets called. A dropped `closed` means onclose never fires, the
    /// transport polls a nil socket forever, and nothing ever reconnects.
    private func deliver(_ msg: [String: Any]) {
        if let parked = parkedPoll {
            parkedPoll = nil
            pollTimer?.cancel()
            pollTimer = nil
            lastContactAt = Date()
            parked(msg)
            return
        }
        pendingControl.append(msg)
    }

    // MARK: - port lifetime

    /// Release the replies parked by a port that is going away, WITHOUT letting
    /// them consume `inbound`. Completing the poll with `pollempty` frees its
    /// NSExtensionContext cleanly; if the worker is already dead it simply goes
    /// nowhere, which is the same outcome as dropping it minus the leak.
    private func retirePreviousPort() {
        if let stale = parkedPoll {
            parkedPoll = nil
            pollTimer?.cancel()
            pollTimer = nil
            stale(["v": NativeFraming.protocolVersion, "t": "pollempty"])
        }
        if let staleOpen = pendingOpenReply {
            pendingOpenReply = nil
            staleOpen(["v": NativeFraming.protocolVersion, "t": "error",
                       "phase": "dial", "message": "superseded_by_new_port"])
        }
    }

    /// Tear the socket down on a path that already knows the port is gone.
    /// Detaching the callbacks first stops MCPSocketSession.close() from
    /// re-entering as a `closed` control frame that nobody is left to read.
    private func discardSocket(reason: String) {
        if let s = socket {
            s.onOpen = nil
            s.onText = nil
            s.onClosed = nil
            s.close(code: .normalClosure, reason: reason)
        }
        socket = nil
        reassembly.removeAll()
        inbound.removeAll()
        pendingChunks.removeAll()
        pendingControl.removeAll()
        lingerBytes = 0
        stopWatchdog()
    }

    /// Any inbound message proves the port is alive: stamp it, abort a linger
    /// started on suspicion, and make sure the silence watchdog is running.
    private func noteContact() {
        lastContactAt = Date()
        cancelLinger()
        armWatchdog()
    }

    private func armWatchdog() {
        guard watchdog == nil else { return }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            guard self.socket != nil else { self.stopWatchdog(); return }
            // Ahead of the parked-poll guard: a lost tail chunk leaves the port
            // looking perfectly healthy, polls and all, so this is the only
            // place a stalled reassembly is ever noticed.
            if NativeFraming.expireStalled(&self.reassembly) {
                self.failReassembly("reassembly_timeout")
                return
            }
            // A held poll is not silence — it is the extension waiting on us.
            guard self.parkedPoll == nil else { return }
            guard Date().timeIntervalSince(self.lastContactAt) > Self.portSilenceSeconds else { return }
            self.stopWatchdog()
            self.portDisconnected()
        }
        timer.resume()
        watchdog = timer
    }

    private func stopWatchdog() {
        watchdog?.cancel()
        watchdog = nil
    }

    // MARK: - linger

    /// Called by the silence watchdog in `armWatchdog()` — Safari gives the
    /// native side no real port-teardown callback, so inferred silence is the
    /// only available trigger. `noteContact()` aborts the linger if the port
    /// turns out to still be alive.
    ///
    /// Runs on `queue`, synchronously. Deferring it with `queue.async` let an
    /// `open` or `poll` land between the watchdog's silence check and the
    /// linger arming; that contact cancelled nothing, and the linger then
    /// closed a live socket without the extension ever hearing about it.
    private func portDisconnected() {
        cancelLinger()
        guard socket != nil else { return }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + Self.lingerSeconds)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            self.lingerTimer = nil
            // Nobody adopted it. Close :7225 so the server sees a real
            // disconnect and arms its own eviction recovery.
            self.retirePreviousPort()
            self.discardSocket(reason: "port_gone")
        }
        timer.resume()
        lingerTimer = timer
        enforceLingerCap()
    }

    /// Buffer overflow during the linger means we can no longer present a
    /// faithful stream; fall back to clean-disconnect semantics. Checked when
    /// the linger arms AND on every frame that arrives while it runs -- the
    /// server keeps sending into a silent port for the whole window.
    /// pendingChunks counts too: nextOutbound() moves an oversized payload's
    /// bytes OUT of lingerBytes when it encodes them, so without this a
    /// half-drained chunk sequence would escape the bound.
    private func enforceLingerCap() {
        guard lingerTimer != nil else { return }
        guard inbound.count + pendingChunks.count > Self.lingerBufferMaxFrames
            || lingerBytes > Self.lingerBufferMaxBytes else { return }
        cancelLinger()
        retirePreviousPort()
        discardSocket(reason: "linger_overflow")
    }

    private func cancelLinger() {
        lingerTimer?.cancel()
        lingerTimer = nil
    }
}
