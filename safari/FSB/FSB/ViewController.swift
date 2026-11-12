//
//  ViewController.swift
//  FSB
//
//  Created by Lakshman on 8/21/26.
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "com.fullselfbrowsing.fsb.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show(\(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show(\(state.isEnabled), false)")
                }
                self.refreshGrantList()
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // The original template force-cast this to String, which crashes the app
        // the moment any other message shape arrives. Cast safely.
        guard let command = message.body as? String else { return }

        switch command {
        case "open-preferences":
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in
                DispatchQueue.main.async {
                    NSApplication.shared.terminate(nil)
                }
            }

        case "grant-folder":
            presentGrantPanel()

        case "clear-grants":
            GrantedRoots.clearGrants()
            refreshGrantList()

        case "refresh-grants":
            refreshGrantList()

        default:
            break
        }
    }

    // MARK: - upload_file folder grants

    /// App Sandbox forbids the extension from reading arbitrary absolute paths,
    /// so upload_file needs an explicit, user-chosen folder. The grant is stored
    /// as a security-scoped bookmark in the shared App Group and read back by
    /// the extension process (see GrantedRoots).
    private func presentGrantPanel() {
        let panel = NSOpenPanel()
        panel.title = "Grant FSB access to a folder"
        panel.message = "FSB can upload files from the folders you choose here. Everything else stays unreadable."
        panel.prompt = "Grant Access"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first

        panel.begin { [weak self] response in
            guard response == .OK else { return }
            for url in panel.urls {
                do {
                    try GrantedRoots.addGrant(url)
                } catch {
                    NSLog("FSB: failed to persist folder grant for %@: %@",
                          url.path, error.localizedDescription)
                }
            }
            self?.refreshGrantList()
        }
    }

    private func refreshGrantList() {
        let roots = GrantedRoots.grantedPaths()
        guard let json = try? JSONSerialization.data(withJSONObject: roots),
              let text = String(data: json, encoding: .utf8)
        else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript("showGrants(\(text))")
        }
    }

}
