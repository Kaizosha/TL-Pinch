//
//  StartView.swift
//  iOS (App)
//
//  Created by Kon on 7/28/25.
//

import SwiftUI
import SafariServices

struct StartView: View {
    @StateObject private var safariViewModel = SafariViewModel()
    @State private var showHowToSheet = false
    
    var body: some View {
        ZStack {
            VStack {
                ScrollView {
                    VStack(spacing: 45) {
                        headerSection
                            .frame(maxWidth: .infinity, alignment: .leading)
                        
                        actionButtons
                        
                        Spacer()
                    }
                    .padding()
                }
                termsAndPrivacySection
                    .padding(.bottom, 20)
            }
        }
        .handleOpenURLInApp(viewModel: safariViewModel)
        .sheet(isPresented: $showHowToSheet) {
            HowToEnable()
                .onAppear {
                    let generator = UIImpactFeedbackGenerator(style: .heavy)
                    generator.impactOccurred()
                }
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
                
                Text("Pinch to see less, know more - Summarize web pages and explain selected text with AI.")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .fontDesign(.monospaced)
                    .multilineTextAlignment(.leading)
                    .padding(.top, 4)
            }
            Spacer()
            // Use a valid SF Symbol or your own asset
            Image(systemName: "arrow.up.forward.and.arrow.down.backward")
                .resizable()
                .frame(width: 48, height: 48)
        }
    }
    
    private var actionButtons: some View {
        VStack(spacing: 20) {
            Button(action: {
                showHowToSheet = true
            }) {
                Label("How to Enable TL;Pinch in Safari", systemImage: "questionmark.circle")
                    .padding()
                    .frame(maxWidth: .infinity)
            }
            .font(.body)
            .fontWeight(.semibold)
            .foregroundStyle(.background)
            .background(.foreground)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .shadow(color: .secondary.opacity(0.3), radius: 4, x: 0, y: 0)
        }
    }
    
    private var termsAndPrivacySection: some View {
        VStack(spacing: 8) {
            HStack(spacing: 4) {
                Text("By using TL;Pinch (by ")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                Button("Kaizosha") {
                    safariViewModel.openURL(URL(string: "https://kaizosha.org")!)
                }
                .buttonStyle(PlainButtonStyle())
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
                .buttonStyle(PlainButtonStyle())
                .foregroundStyle(.primary)
                .underline()
                
                Text("and")
                    .foregroundStyle(.secondary)
                
                Button("Privacy Policy") {
                    safariViewModel.openURL(URL(string: "https://kaizosha.org/privacy")!)
                }
                .buttonStyle(PlainButtonStyle())
                .foregroundStyle(.primary)
                .underline()
            }
            .font(.caption)
        }
        .multilineTextAlignment(.center)
    }
}

// --- SafariViewModel and SafariViewControllerViewModifier ---

class SafariViewModel: ObservableObject {
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
        return SFSafariViewController(url: url)
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

