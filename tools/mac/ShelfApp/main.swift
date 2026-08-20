import Cocoa
import WebKit

let port = ProcessInfo.processInfo.environment["PORT"] ?? "3000"
let serverURLString = "http://localhost:\(port)"

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    var didStartServer = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupWindow()
        startServerIfNeeded()
        waitForServerAndLoad()
    }

    func setupWindow() {
        let rect = NSRect(x: 0, y: 0, width: 1280, height: 820)
        window = NSWindow(contentRect: rect,
                           styleMask: [.titled, .closable, .miniaturizable, .resizable],
                           backing: .buffered, defer: false)
        window.title = "Shelf"
        window.center()
        window.setFrameAutosaveName("ShelfMainWindow")

        webView = WKWebView(frame: rect, configuration: WKWebViewConfiguration())
        webView.navigationDelegate = self
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // Shelf.app is expected to sit directly inside the project folder.
    func projectRoot() -> String {
        (Bundle.main.bundlePath as NSString).deletingLastPathComponent
    }

    func isServerRunning() -> Bool {
        guard let url = URL(string: serverURLString) else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.5

        let semaphore = DispatchSemaphore(value: 0)
        var ok = false
        let task = URLSession.shared.dataTask(with: request) { _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode < 500 {
                ok = true
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 2)
        return ok
    }

    func startServerIfNeeded() {
        if isServerRunning() { return }

        guard let scriptPath = Bundle.main.path(forResource: "server-launch", ofType: "sh") else {
            showError("Missing server-launch.sh in app bundle. Run tools/mac/build.sh again.")
            return
        }

        let logDir = (NSHomeDirectory() as NSString).appendingPathComponent("Library/Logs/Shelf")
        try? FileManager.default.createDirectory(atPath: logDir, withIntermediateDirectories: true)
        let logPath = (logDir as NSString).appendingPathComponent("server.log")
        if !FileManager.default.fileExists(atPath: logPath) {
            FileManager.default.createFile(atPath: logPath, contents: nil)
        }
        let logHandle = FileHandle(forWritingAtPath: logPath)
        logHandle?.seekToEndOfFile()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [scriptPath, projectRoot(), port]
        process.standardOutput = logHandle
        process.standardError = logHandle

        do {
            try process.run()
            serverProcess = process
            didStartServer = true
        } catch {
            showError("Failed to start Shelf server: \(error.localizedDescription)")
        }
    }

    func waitForServerAndLoad() {
        DispatchQueue.global().async {
            for _ in 0..<30 {
                if self.isServerRunning() { break }
                Thread.sleep(forTimeInterval: 1)
            }
            DispatchQueue.main.async {
                self.webView.load(URLRequest(url: URL(string: serverURLString)!))
            }
        }
    }

    func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Shelf"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        guard didStartServer, let process = serverProcess, process.isRunning else { return }
        process.terminate()
        process.waitUntilExit()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
