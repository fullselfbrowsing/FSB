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

    let url: URL
    let origin: String?
    let socketId = UUID().uuidString

    // Threading: every mutable member below is read and written on `queue`
    // alone. The owner calls in from its own queue, URLSession calls back on
    // its delegate queue, and the ping timer fires on a third; left alone,
    // those raced on `task`, `session` and `pingTimer` -- a close cancelling
    // the task while the failed receive tore the same fields down from
    // URLSession's queue -- and concurrent stores to a strong reference can
    // over-release it and crash the extension process. So the public entry
    // points hop onto `queue`, and URLSession is handed an OperationQueue that
    // runs on `queue`, which brings its delegate callbacks and every task
    // completion handler there too.
    //
    // The hops are async and `queue` is serial, so calls keep the order they
    // were made in: callbacks set before open() are in place when the dial
    // starts, and callbacks cleared before close() are gone when it runs.
    private let queue = DispatchQueue(label: "com.fullselfbrowsing.fsb.socket")
    private static let queueKey = DispatchSpecificKey<ObjectIdentifier>()

    private var _state: State = .idle
    private var _onOpen: ((String) -> Void)?
    private var _onText: ((String) -> Void)?
    private var _onClosed: ((Int, String) -> Void)?
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?
    private var pingTimer: DispatchSourceTimer?

    /// Read from any queue. The owner reads it on its own queue, and nothing on
    /// `queue` ever waits on the owner's, so the sync cannot deadlock.
    var state: State { onQueue { _state } }

    var onOpen: ((String) -> Void)? {
        get { onQueue { _onOpen } }
        set { queue.async { self._onOpen = newValue } }
    }
    var onText: ((String) -> Void)? {
        get { onQueue { _onText } }
        set { queue.async { self._onText = newValue } }
    }
    var onClosed: ((Int, String) -> Void)? {
        get { onQueue { _onClosed } }
        set { queue.async { self._onClosed = newValue } }
    }

    init(url: URL, origin: String?) {
        self.url = url
        self.origin = origin
        super.init()
        queue.setSpecific(key: Self.queueKey, value: ObjectIdentifier(self))
    }

    private func onQueue<T>(_ body: () -> T) -> T {
        if DispatchQueue.getSpecific(key: Self.queueKey) == ObjectIdentifier(self) { return body() }
        return queue.sync(execute: body)
    }

    func open() {
        queue.async { self.openOnQueue() }
    }

    func send(_ text: String) {
        queue.async { self.sendOnQueue(text) }
    }

    func close(code: URLSessionWebSocketTask.CloseCode = .normalClosure, reason: String = "intentional") {
        queue.async { self.closeOnQueue(code: code, reason: reason) }
    }

    // MARK: - On `queue`

    private func openOnQueue() {
        guard _state == .idle else { return }
        _state = .dialing
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        let delegateQueue = OperationQueue()
        delegateQueue.underlyingQueue = queue
        delegateQueue.maxConcurrentOperationCount = 1
        let session = URLSession(configuration: config, delegate: self, delegateQueue: delegateQueue)
        self.session = session
        var request = URLRequest(url: url)
        if let origin { request.setValue(origin, forHTTPHeaderField: "Origin") }
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        pump()
    }

    private func sendOnQueue(_ text: String) {
        guard let task = task, _state == .open else { return }
        task.send(.string(text)) { [weak self] error in
            guard let self, let error else { return }
            self.fail(code: 1006, reason: "send_failed:\(error.localizedDescription)")
        }
    }

    private func closeOnQueue(code: URLSessionWebSocketTask.CloseCode, reason: String) {
        guard _state == .open || _state == .dialing else { return }
        _state = .closing
        stopPing()
        task?.cancel(with: code, reason: reason.data(using: .utf8))
        task = nil
        session?.invalidateAndCancel()
        session = nil
        _state = .closed
        _onClosed?(Int(code.rawValue), reason)
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
                    self._onText?(text)
                case .data(let data):
                    // The `ws` npm server sends text, but never assume it.
                    if let text = String(data: data, encoding: .utf8) { self._onText?(text) }
                @unknown default:
                    break
                }
                self.pump()
            }
        }
    }

    private func fail(code: Int, reason: String) {
        guard _state != .closed else { return }
        _state = .closed
        stopPing()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        _onClosed?(code, reason)
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

    // MARK: - URLSessionWebSocketDelegate (delivered on `queue`)

    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocol: String?) {
        // A close that ran while the handshake was finishing already settled
        // this session; it must not come back to life as open.
        guard _state == .dialing else { return }
        _state = .open
        startPing()
        _onOpen?(socketId)
    }

    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
                    reason: Data?) {
        let text = reason.flatMap { String(data: $0, encoding: .utf8) } ?? "remote_closed"
        fail(code: Int(closeCode.rawValue), reason: text)
    }
}
