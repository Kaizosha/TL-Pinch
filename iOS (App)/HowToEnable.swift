//
//  HowToEnable.swift
//  iOS (App)
//
//  Created by Kon on 7/28/25.
//

import FoundationModels
import StoreKit
import SwiftUI
import UIKit

struct AppBadgeView: View {
    let badge: SupportAppBadge
    @ScaledMetric(relativeTo: .body) private var badgeWidth = 34
    @ScaledMetric(relativeTo: .body) private var textBadgeSize = 15

    var body: some View {
        Group {
            switch badge {
            case .system(let name):
                Image(systemName: name)
                    .font(.title2)
            case .text(let text):
                Text(text)
                    .font(.system(size: textBadgeSize, weight: .semibold, design: .rounded))
                    .monospaced()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(width: badgeWidth)
        .accessibilityHidden(true)
    }
}

struct AppButton: View {
    let app: SupportApp

    @Environment(\.openURL) private var openURL
    @State private var showAppStore = false
    @ScaledMetric(relativeTo: .body) private var rowSpacing = 12
    @ScaledMetric(relativeTo: .body) private var cardPadding = 16

    var body: some View {
        Button {
            guard let link = app.link else {
                return
            }

            if link.hasPrefix("http"), let url = URL(string: link) {
                openURL(url)
            } else {
                showAppStore = true
            }
        } label: {
            HStack(spacing: rowSpacing) {
                AppBadgeView(badge: app.badge)

                VStack(alignment: .leading, spacing: 4) {
                    Text(app.name)
                        .font(.body)
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)

                    Text(app.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if app.link != nil {
                    Image(systemName: "arrow.up.right.square")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Image(systemName: "hourglass")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(cardPadding)
            .pinchSupportRowSurface(isEnabled: app.link != nil)
        }
        .buttonStyle(.plain)
        .disabled(app.link == nil)
        .accessibilityElement(children: .combine)
        .accessibilityHint(app.link == nil ? "This app is not available yet." : "Opens more information for \(app.name).")
        .appStoreOverlay(isPresented: $showAppStore) {
            SKOverlay.AppConfiguration(appIdentifier: app.link ?? "", position: .bottom)
        }
    }
}

struct HowToEnable: View {
    @Environment(\.openURL) private var openURL
    @ScaledMetric(relativeTo: .title) private var topPadding = 24
    @ScaledMetric(relativeTo: .title3) private var sectionSpacing = 32
    @ScaledMetric(relativeTo: .body) private var rowSpacing = 12
    @ScaledMetric(relativeTo: .body) private var appSpacing = 16

    var body: some View {
        ScrollView {
            VStack(spacing: sectionSpacing) {
                Text("How to Enable TL;Pinch in Safari")
                    .font(.title)
                    .fontWeight(.bold)
                    .fontDesign(.serif)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, topPadding)

                VStack(alignment: .leading, spacing: rowSpacing) {
                    HowToEnableRow(
                        title: "Open Settings",
                        subtitle: "Start in the Settings app on your device.",
                        systemImage: "gear",
                        action: openSystemSettings
                    )

                    HowToEnableRow(
                        title: "Go to Safari",
                        subtitle: "Open Safari, then tap Extensions.",
                        systemImage: "safari"
                    )

                    HowToEnableRow(
                        title: "Turn on TL;Pinch",
                        subtitle: "Find TL;Pinch in the list and enable it.",
                        systemImage: "checkmark.circle"
                    )

                    HowToEnableRow(
                        title: "Allow Permissions",
                        subtitle: "Grant the website access TL;Pinch needs to work in Safari.",
                        systemImage: "hand.raised"
                    )
                }

                Text("Once enabled, TL;Pinch can summarize long pages and explain selected text right inside Safari.")
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                TLPinchInfoCard()

                Divider()
                    .padding(.vertical)

                VStack(alignment: .leading, spacing: 16) {
                    Text("Support Kaizōsha")
                        .font(.headline)
                        .fontWeight(.semibold)

                    Text("Check out our other apps:")
                        .font(.body)
                        .foregroundStyle(.secondary)

                    PinchGlassGroup(spacing: appSpacing) {
                        VStack(spacing: appSpacing) {
                            ForEach(SupportAppsData.apps, id: \.name) { app in
                                AppButton(app: app)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer(minLength: 40)
            }
            .padding(.horizontal)
        }
    }
}

private struct HowToEnableRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    var action: (() -> Void)? = nil

    @ScaledMetric(relativeTo: .body) private var iconWidth = 34
    @ScaledMetric(relativeTo: .body) private var rowPadding = 16

    var body: some View {
        Group {
            if let action {
                Button(action: action) {
                    rowContent
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens Settings.")
            } else {
                rowContent
            }
        }
        .padding(rowPadding)
        .pinchSupportRowSurface(isEnabled: action != nil)
        .accessibilityElement(children: .combine)
    }

    private var rowContent: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3)
                .frame(width: iconWidth)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body)
                    .fontWeight(.semibold)
                    .foregroundStyle(.primary)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if action != nil {
                Image(systemName: "arrow.up.right.square")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
        }
    }
}

private struct TLPinchInfoCard: View {
    private let model = SystemLanguageModel.default
    @ScaledMetric(relativeTo: .body) private var rowPadding = 16

    var body: some View {
        switch model.availability {
        case .available:
            card(
                status: "On",
                statusColor: .green,
                detail: "TL;Pinch uses Apple Intelligence to summarize web pages and explain highlighted text right where you are reading."
            )
        case .unavailable(let reason):
            let disabled = isDeviceUnsupported(reason)
            card(
                status: disabled ? "Off" : unavailableStatus(for: reason),
                statusColor: disabled ? .secondary : unavailableStatusColor(for: reason),
                detail: detailText(for: reason),
                showsSettingsButton: showsSettingsButton(for: reason),
                isDisabled: disabled
            )
        }
    }

    private func card(
        status: String,
        statusColor: Color,
        detail: String,
        showsSettingsButton: Bool = false,
        isDisabled: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "apple.intelligence")
                    .font(.title3)
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: 28)
                    .accessibilityHidden(true)

                Text("Apple Intelligence")
                    .font(.body)
                    .fontWeight(.semibold)

                Spacer(minLength: 0)

                Text(status)
                    .font(.footnote)
                    .fontWeight(.semibold)
                    .foregroundStyle(statusColor)
            }

            Text(detail)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if showsSettingsButton {
                Button(action: openAppleIntelligenceSettings) {
                    Label("Open Settings", systemImage: "gear")
                        .font(.body)
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .tint(.red)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, rowPadding)
        .foregroundStyle(isDisabled ? .secondary : .primary)
        .saturation(isDisabled ? 0 : 1)
        .opacity(isDisabled ? 0.62 : 1)
        .pinchSupportRowSurface(isEnabled: !isDisabled)
    }

    private func unavailableStatus(for reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
        switch reason {
        case .deviceNotEligible:
            "Off"
        case .appleIntelligenceNotEnabled:
            "Off"
        case .modelNotReady:
            "Preparing"
        @unknown default:
            "Unavailable"
        }
    }

    private func unavailableStatusColor(for reason: SystemLanguageModel.Availability.UnavailableReason) -> Color {
        switch reason {
        case .deviceNotEligible:
            .red
        case .appleIntelligenceNotEnabled:
            .secondary
        case .modelNotReady:
            .orange
        @unknown default:
            .red
        }
    }

    private func detailText(for reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
        switch reason {
        case .deviceNotEligible:
            "This device cannot use Apple Intelligence, so TL;Pinch will not be able to run its on-device summaries and explanations here."
        case .appleIntelligenceNotEnabled:
            "Turn on Apple Intelligence in Settings to use TL;Pinch for on-device summaries and explanations in Safari."
        case .modelNotReady:
            "Apple Intelligence is still getting ready on this device. TL;Pinch will work once the model finishes preparing."
        @unknown default:
            "Apple Intelligence is not ready on this device yet. Try again after checking Settings."
        }
    }

    private func isDeviceUnsupported(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> Bool {
        switch reason {
        case .deviceNotEligible:
            true
        case .appleIntelligenceNotEnabled, .modelNotReady:
            false
        @unknown default:
            false
        }
    }

    private func showsSettingsButton(for reason: SystemLanguageModel.Availability.UnavailableReason) -> Bool {
        switch reason {
        case .appleIntelligenceNotEnabled, .modelNotReady:
            true
        case .deviceNotEligible:
            false
        @unknown default:
            true
        }
    }

    private func openAppleIntelligenceSettings() {
        if let settingsURL = URL(string: "App-prefs:") {
            UIApplication.shared.open(settingsURL)
        }
    }
}

private extension HowToEnable {
    func openSystemSettings() {
        if let safariSettingsURL = URL(string: "App-prefs:root=SAFARI") {
            openURL(safariSettingsURL)
            return
        }

        if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
            openURL(settingsURL)
        }
    }
}

#Preview {
    HowToEnable()
}
