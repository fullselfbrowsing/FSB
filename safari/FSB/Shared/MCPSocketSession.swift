//
//  MCPSocketSession.swift
//  FSB — shared by the container app and the Safari web extension target.
//
//  The real WebSocket to the FSB MCP server on ws://localhost:7225.
//
//  This is what makes "same MCP, same port" true on Safari. A Safari Web
//  Extension cannot open ws://localhost from JavaScript (the extension CSP
//  refuses it, and com.apple.security.network.client applies to Safari APP
//  Extensions, not Web Extensions). Native URLSession traffic from the
//  app-extension process is a DIFFERENT subsystem, and that entitlement does
//  govern it — which is why this class can dial a port the page context cannot.
//
//  URLSessionWebSocketTask is not a browser and sends no Origin header of its
//  own. The server treats an Origin-less socket as an MCP relay that must say
//  relay:hello, never as the extension, so the extension's origin (from the
//  `open` frame) is sent explicitly.
//

import Foundation

final class MCPSocketSession: NSObject, URLSessionWebSocketDelegate {

    enum State { case idle, dialing, open, closing, closed }

    private(set) var state: State = .idle
    let url: URL
    let origin: String?
    let socketId = UUID().uuidString

    var onOpen: ((String) -> Void)?
    var onText: ((String) -> Void)?
    var onClosed: ((Int, String) -> Void)?

    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private var pingTimer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "com.fullselfbrowsing.fsb.socket")

    init(url: URL, origin: String?) {
        self.url = url
        self.origin = origin
        super.init()
    }

    func open() {
        guard state == .idle else { return }
        state = .dialing
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        self.session = session
        var request = URLRequest(url: url)
        if let origin { request.setValue(origin, forHTTPHeaderField: "Origin") }
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        pump()
    }

    func send(_ text: String) {
        guard let task = task, state == .open else { return }
        task.send(.string(text)) { [weak self] error in
            guard let self, let error else { return }
            self.fail(code: 1006, reason: "send_failed:\(error.localizedDescription)")
        }
    }

    func close(code: URLSessionWebSocketTask.CloseCode = .normalClosure, reason: String = "intentional") {
        guard state == .open || state == .dialing else { return }
        state = .closing
        stopPing()
        task?.cancel(with: code, reason: reason.data(using: .utf8))
        task = nil
        session?.invalidateAndCancel()
        session = nil
        state = .closed
        onClosed?(Int(code.rawValue), reason)
    }

    // MARK: - Receive loop

    /// URLSessionWebSocketTask.receive delivers exactly ONE message and must be
    /// re-armed inside its own completion handler. Forgetting the recursion is
    /// the classic bug here and yields precisely one message, forever.
    private func pump() {
        guard let task = task else { return }
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error):
                self.fail(code: 1006, reason: "receive_failed:\(error.localizedDescription)")
            case .success(let message):
                switch message {
                case .string(let text):
                    self.onText?(text)
                case .data(let data):
                    // The `ws` npm server sends text, but never assume it.
                    if let text = String(data: data, encoding: .utf8) { self.onText?(text) }
                @unknown default:
                    break
                }
                self.pump()
            }
        }
    }

    private func fail(code: Int, reason: String) {
        guard state != .closed else { return }
        state = .closed
        stopPing()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        onClosed?(code, reason)
    }

    // MARK: - Ping

    /// URLSession does not send protocol pings on its own. The `ws` server
    /// answers them, so this is free half-open detection.
    private func startPing() {
        stopPing()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 30, repeating: 30)
        timer.setEventHandler { [weak self] in
            self?.task?.sendPing { error in
                if let error { self?.fail(code: 1006, reason: "ping_failed:\(error.localizedDescription)") }
            }
        }
        timer.resume()
        pingTimer = timer
    }

    private func stopPing() {
        pingTimer?.cancel()
        pingTimer = nil
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocol: String?) {
        state = .open
        startPing()
        onOpen?(socketId)
    }

    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
                    reason: Data?) {
        let text = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "remote_closed"
        fail(code: Int(closeCode.rawValue), reason: text)
    }
}
