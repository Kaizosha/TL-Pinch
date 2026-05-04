//
//  ViewController.swift
//  Shared (App)
//
//  Created by Kon on 7/28/25.
//

import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import FoundationModels
import SafariServices
import SwiftUI
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "com.kaizokonpaku.TL-Pinch.Extension"

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {
    @IBOutlet var webView: WKWebView!

#if os(macOS)
    private let macViewModel = TLPinchMacViewModel()
    private var hostingController: NSHostingController<TLPinchMacRootView>?
#endif

    override func viewDidLoad() {
        super.viewDidLoad()

#if os(iOS)
        webView.navigationDelegate = self
        webView.scrollView.isScrollEnabled = false
        webView.configuration.userContentController.add(self, name: "controller")
        webView.loadFileURL(
            Bundle.main.url(forResource: "Main", withExtension: "html")!,
            allowingReadAccessTo: Bundle.main.resourceURL!
        )
#elseif os(macOS)
        installMacRootView()
        macViewModel.refreshExtensionState()
#endif
    }

#if os(macOS)
    override func viewDidAppear() {
        super.viewDidAppear()
        configureWindow()
        macViewModel.refreshExtensionState()
    }

    private func installMacRootView() {
        webView.removeFromSuperview()

        let hostingController = NSHostingController(
            rootView: TLPinchMacRootView(viewModel: macViewModel)
        )

        addChild(hostingController)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hostingController.view)

        NSLayoutConstraint.activate([
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        self.hostingController = hostingController
    }

    private func configureWindow() {
        guard let window = view.window else {
            return
        }

        let targetSize = NSSize(width: 760, height: 820)
        window.title = "TL;Pinch"
        window.minSize = NSSize(width: 700, height: 720)
        window.tabbingMode = .disallowed
        window.setContentSize(targetSize)
    }
#endif

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")
#endif
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {}
}

#if os(macOS)
@MainActor
private final class TLPinchMacViewModel: ObservableObject {
    enum SafariExtensionStatus {
        case checking
        case enabled
        case disabled
        case unavailable

        var label: String {
            switch self {
            case .checking:
                "Checking"
            case .enabled:
                "On"
            case .disabled:
                "Off"
            case .unavailable:
                "Unavailable"
            }
        }

        var color: Color {
            switch self {
            case .checking:
                .secondary
            case .enabled:
                .green
            case .disabled, .unavailable:
                .red
            }
        }

        var detail: String {
            switch self {
            case .checking:
                "Checking whether TL;Pinch is ready in Safari."
            case .enabled:
                "TL;Pinch is ready in Safari. You can manage it any time in Safari Settings > Extensions."
            case .disabled:
                "Turn on TL;Pinch in Safari Settings > Extensions, then allow it on the websites where you want to use it."
            case .unavailable:
                "Open Safari Settings > Extensions and turn on TL;Pinch there if Safari does not report the state automatically."
            }
        }
    }

    @Published private(set) var extensionStatus: SafariExtensionStatus = .checking

    func refreshExtensionState() {
        extensionStatus = .checking

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { [weak self] state, error in
            DispatchQueue.main.async {
                guard let self else {
                    return
                }

                guard let state, error == nil else {
                    self.extensionStatus = .unavailable
                    return
                }

                self.extensionStatus = state.isEnabled ? .enabled : .disabled
            }
        }
    }

    func openSafariExtensionSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { [weak self] error in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                guard let self else {
                    return
                }

                if error != nil {
                    self.extensionStatus = .unavailable
                } else {
                    self.refreshExtensionState()
                }
            }
        }
    }
}

private struct TLPinchMacRootView: View {
    @ObservedObject var viewModel: TLPinchMacViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                headerSection
                safariExtensionSection
                enableStepsSection
                appleIntelligenceSection
                supportAppsSection
            }
            .padding(32)
            .frame(maxWidth: 720, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var headerSection: some View {
        HStack(alignment: .top, spacing: 20) {
            VStack(alignment: .leading, spacing: 10) {
                Group {
                    Text("Too long?")
                    Text("Just")
                    Text("Pinch.")
                }
                .font(.system(.largeTitle, design: .serif, weight: .bold))

                Text("pinch to see less, know more.")
                    .font(.headline.monospaced())
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            Image(systemName: "arrow.up.forward.and.arrow.down.backward")
                .font(.system(size: 54, weight: .regular))
                .accessibilityHidden(true)
        }
    }

    private var safariExtensionSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: "safari")
                    .font(.title2)
                    .symbolRenderingMode(.hierarchical)

                Text("Safari Extension")
                    .font(.title3)
                    .fontWeight(.semibold)

                Spacer(minLength: 0)

                statusText(viewModel.extensionStatus.label, color: viewModel.extensionStatus.color)
            }

            Text(viewModel.extensionStatus.detail)
                .font(.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                viewModel.openSafariExtensionSettings()
            } label: {
                Label("Open Safari Extensions Settings", systemImage: "arrow.up.right.square")
                    .font(.body)
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .tlPinchMacCardSurface()
    }

    private var enableStepsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("How to enable TL;Pinch")
                .font(.title3)
                .fontWeight(.semibold)

            VStack(spacing: 12) {
                TLPinchMacStepRow(
                    title: "Open Safari Settings",
                    subtitle: "From Safari, open Settings and choose Extensions.",
                    systemImage: "gear"
                )

                TLPinchMacStepRow(
                    title: "Turn on TL;Pinch",
                    subtitle: "Enable TL;Pinch in the extensions list.",
                    systemImage: "checkmark.circle"
                )

                TLPinchMacStepRow(
                    title: "Allow website access",
                    subtitle: "Give TL;Pinch permission on the sites where you want summaries and explanations.",
                    systemImage: "hand.raised"
                )
            }
        }
    }

    private var appleIntelligenceSection: some View {
        TLPinchMacAppleIntelligenceCard()
    }

    private var supportAppsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Pinch support apps")
                .font(.title3)
                .fontWeight(.semibold)

            Text("Check out more from Kaizōsha.")
                .font(.body)
                .foregroundStyle(.secondary)

            VStack(spacing: 12) {
                ForEach(TLPinchMacSupportApp.apps) { app in
                    TLPinchMacSupportAppRow(app: app)
                }
            }
        }
    }

    private func statusText(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.footnote)
            .fontWeight(.semibold)
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(.primary.opacity(0.08), in: Capsule())
    }
}

private struct TLPinchMacStepRow: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3)
                .symbolRenderingMode(.hierarchical)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body)
                    .fontWeight(.semibold)

                Text(subtitle)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .tlPinchMacCardSurface(cornerRadius: 20, padding: 18)
    }
}

private struct TLPinchMacAppleIntelligenceCard: View {
    private let model = SystemLanguageModel.default

    var body: some View {
        let content = appleIntelligenceContent

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: "apple.intelligence")
                    .font(.title2)
                    .symbolRenderingMode(.hierarchical)

                Text("Apple Intelligence")
                    .font(.title3)
                    .fontWeight(.semibold)

                Spacer(minLength: 0)

                Text(content.status)
                    .font(.footnote)
                    .fontWeight(.semibold)
                    .foregroundStyle(content.color)
            }

            Text(content.detail)
                .font(.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .tlPinchMacCardSurface()
    }

    private var appleIntelligenceContent: (status: String, color: Color, detail: String) {
        switch model.availability {
        case .available:
            return (
                "On",
                .green,
                "TL;Pinch uses Apple Intelligence to summarize web pages and explain highlighted text right where you are reading in Safari."
            )
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible:
                return (
                    "Unavailable",
                    .red,
                    "This Mac cannot use Apple Intelligence, so TL;Pinch will not be able to run its on-device summaries and explanations here."
                )
            case .appleIntelligenceNotEnabled:
                return (
                    "Off",
                    .secondary,
                    "Turn on Apple Intelligence in System Settings to use TL;Pinch for on-device summaries and explanations in Safari."
                )
            case .modelNotReady:
                return (
                    "Preparing",
                    .orange,
                    "Apple Intelligence is still getting ready on this Mac. TL;Pinch will work once the model finishes preparing."
                )
            @unknown default:
                return (
                    "Unavailable",
                    .red,
                    "Apple Intelligence is not ready on this Mac yet. Check System Settings and try again."
                )
            }
        }
    }
}

private struct TLPinchMacSupportAppRow: View {
    let app: TLPinchMacSupportApp
    @Environment(\.openURL) private var openURL

    var body: some View {
        Group {
            if let url = app.url {
                Button {
                    openURL(url)
                } label: {
                    rowContent(trailingSystemImage: "arrow.up.right.square")
                }
                .buttonStyle(.plain)
            } else {
                rowContent(trailingSystemImage: "hourglass")
                    .opacity(0.72)
            }
        }
        .tlPinchMacCardSurface(cornerRadius: 20, padding: 18)
    }

    private func rowContent(trailingSystemImage: String) -> some View {
        HStack(spacing: 12) {
            TLPinchMacSupportAppBadge(badge: app.badge)

            VStack(alignment: .leading, spacing: 4) {
                Text(app.name)
                    .font(.body)
                    .fontWeight(.semibold)

                Text(app.description)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            Image(systemName: trailingSystemImage)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct TLPinchMacSupportAppBadge: View {
    let badge: TLPinchMacSupportApp.Badge

    var body: some View {
        Group {
            switch badge {
            case .system(let name):
                Image(systemName: name)
                    .font(.title3)
            case .text(let text):
                Text(text)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospaced()
            }
        }
        .frame(width: 28)
        .accessibilityHidden(true)
    }
}

private struct TLPinchMacSupportApp: Identifiable {
    enum Badge {
        case system(String)
        case text(String)
    }

    let id = UUID()
    let name: String
    let description: String
    let url: URL?
    let badge: Badge

    static let apps: [TLPinchMacSupportApp] = [
        TLPinchMacSupportApp(
            name: "Together",
            description: "nothing gets lost in translation. watch anything. hear everything.",
            url: nil,
            badge: .system("chevron.forward")
        ),
        TLPinchMacSupportApp(
            name: "Hush",
            description: "while you're in the moment, it listens. it sees. it remembers.",
            url: URL(string: "https://github.com/Kaizosha/Hush"),
            badge: .text("^-^")
        ),
        TLPinchMacSupportApp(
            name: "mind.",
            description: "coding agent that runs on your devices",
            url: nil,
            badge: .system("circle.dotted")
        ),
        TLPinchMacSupportApp(
            name: "Morph",
            description: "the web, but how you want it.",
            url: nil,
            badge: .system("line.3.horizontal")
        ),
        TLPinchMacSupportApp(
            name: "Browse",
            description: "the web, filtered through understanding.",
            url: nil,
            badge: .system("text.line.magnify")
        )
    ]
}

private extension View {
    func tlPinchMacCardSurface(cornerRadius: CGFloat = 24, padding: CGFloat = 22) -> some View {
        self
            .padding(padding)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.primary.opacity(0.08), lineWidth: 1)
            }
    }
}
#endif
