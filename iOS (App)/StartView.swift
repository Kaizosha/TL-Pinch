//
//  StartView.swift
//  iOS (App)
//
//  Created by Kon on 7/28/25.
//

import FoundationModels
import SafariServices
import SwiftUI
import TipKit

struct StartView: View {
    private let model = SystemLanguageModel.default
    private let howToTip = HowToButtonTip()
    @StateObject private var safariViewModel = SafariViewModel()
    @State private var showHowToSheet = false
    @ScaledMetric(relativeTo: .largeTitle) private var heroIconSize = 55
    @ScaledMetric(relativeTo: .title3) private var sectionSpacing = 45
    @ScaledMetric(relativeTo: .body) private var buttonHorizontalPadding = 20
    @ScaledMetric(relativeTo: .body) private var buttonVerticalPadding = 16
    @ScaledMetric(relativeTo: .caption) private var termsBottomPadding = 20

    var body: some View {
        VStack {
            ScrollView {
                VStack(spacing: sectionSpacing) {
                    headerSection
                        .frame(maxWidth: .infinity, alignment: .leading)

                    actionButton

                    Spacer()
                }
                .padding()
            }

            termsAndPrivacySection
                .padding(.bottom, termsBottomPadding)
        }
        .background(Color(.systemBackground))
        .handleOpenURLInApp(viewModel: safariViewModel)
        .sensoryFeedback(.impact(weight: .heavy), trigger: showHowToSheet) { wasPresented, isPresented in
            wasPresented != isPresented
        }
        .sheet(isPresented: $showHowToSheet) {
            HowToEnable()
                .pinchPrimarySheetPresentation()
        }
    }

    private var headerSection: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading) {
                Group {
                    Text("Too long?")
                    Text("Just")
                    Text("Pinch.")
                }
                .font(.largeTitle)
                .fontWeight(.bold)
                .fontDesign(.serif)

                Text("pinch to see less, know more.")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .fontDesign(.monospaced)
                    .multilineTextAlignment(.leading)
                    .padding(.top, 4)
            }

            Spacer()

            Image(systemName: "arrow.up.forward.and.arrow.down.backward")
                .resizable()
                .frame(width: heroIconSize, height: heroIconSize)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
    }

    private var actionButton: some View {
        PinchGlassGroup(spacing: 20) {
            HStack(spacing: 16) {
                Button {
                    howToTip.invalidate(reason: .actionPerformed)
                    showHowToSheet = true
                } label: {
                    Label("How to Enable TL;Pinch in Safari", systemImage: "questionmark.circle")
                        .font(.body)
                        .fontWeight(.semibold)
                        .foregroundStyle(appleIntelligenceNeedsAttention ? .red : .primary)
                        .padding(.horizontal, buttonHorizontalPadding)
                        .padding(.vertical, buttonVerticalPadding)
                        .frame(maxWidth: .infinity)
                }
                .pinchRoundedGlassButton(capsule: true)
                .popoverTip(howToTip, arrowEdge: .bottom)
            }
        }
    }

    private var termsAndPrivacySection: some View {
        VStack(spacing: 8) {
            HStack(spacing: 4) {
                Text("By using TL;Pinch ( by ")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button("Kaizōsha") {
                    safariViewModel.openURL(URL(string: "https://kaizosha.org")!)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary)
                .underline()
                .font(.caption)

                Text("), you agree to our")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 4) {
                Button("Terms of Service") {
                    safariViewModel.openURL(URL(string: "https://kaizosha.org/terms")!)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary)
                .underline()

                Text("and")
                    .foregroundStyle(.secondary)

                Button("Privacy Policy") {
                    safariViewModel.openURL(URL(string: "https://kaizosha.org/privacy")!)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary)
                .underline()
            }
            .font(.caption)
        }
        .multilineTextAlignment(.center)
        .accessibilityElement(children: .contain)
    }

    private var appleIntelligenceNeedsAttention: Bool {
        switch model.availability {
        case .available:
            false
        case .unavailable:
            true
        }
    }
}

private struct HowToButtonTip: Tip {
    var title: Text {
        Text("Find help fast")
    }

    var message: Text? {
        Text("Open setup tips and support apps whenever you need a hand.")
    }

    var image: Image? {
        nil
    }

    var options: [any TipOption] {
        [
            MaxDisplayCount(1)
        ]
    }
}

final class SafariViewModel: ObservableObject {
    @Published var urlToOpen: IdentifiableURL?

    func openURL(_ url: URL) {
        urlToOpen = IdentifiableURL(url: url)
    }
}

struct IdentifiableURL: Identifiable {
    let id = UUID()
    let url: URL
}

struct SafariViewControllerViewModifier: ViewModifier {
    @ObservedObject var viewModel: SafariViewModel

    func body(content: Content) -> some View {
        content
            .sheet(item: $viewModel.urlToOpen) { identifiableURL in
                SFSafariView(url: identifiableURL.url)
            }
    }
}

struct SFSafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

extension View {
    func handleOpenURLInApp(viewModel: SafariViewModel) -> some View {
        modifier(SafariViewControllerViewModifier(viewModel: viewModel))
    }
}

#Preview {
    StartView()
}
