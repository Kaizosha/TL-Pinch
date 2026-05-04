//
//  PinchLiquidGlass.swift
//  iOS (App)
//
//  Created by Codex on 4/18/26.
//

import SwiftUI
import UIKit

enum PinchGlassMetrics {
    static let controlCornerRadius: CGFloat = 22
}

enum PinchGlassProminence {
    case regular
    case prominent
}

struct PinchGlassGroup<Content: View>: View {
    let spacing: CGFloat
    @ViewBuilder let content: Content

    var body: some View {
        GlassEffectContainer(spacing: spacing) {
            content
        }
    }
}

extension View {
    @ViewBuilder
    func pinchRoundedGlassButton(
        prominence: PinchGlassProminence = .regular,
        cornerRadius: CGFloat = PinchGlassMetrics.controlCornerRadius,
        capsule: Bool = false,
        enabled: Bool = true
    ) -> some View {
        let borderShape: ButtonBorderShape = capsule
            ? .capsule
            : .roundedRectangle(radius: cornerRadius)

        switch prominence {
        case .regular:
            self
                .buttonStyle(.glass)
                .buttonBorderShape(borderShape)
                .disabled(!enabled)
        case .prominent:
            self
                .buttonStyle(.glassProminent)
                .buttonBorderShape(borderShape)
                .disabled(!enabled)
        }
    }

    @ViewBuilder
    func pinchLiquidGlass(
        cornerRadius: CGFloat,
        prominence: PinchGlassProminence = .regular,
        interactive: Bool = false
    ) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        let glass: Glass = {
            switch prominence {
            case .regular:
                return .regular
            case .prominent:
                return .regular.tint(.primary.opacity(0.14))
            }
        }()

        if interactive {
            self.glassEffect(glass.interactive(), in: shape)
        } else {
            self.glassEffect(glass, in: shape)
        }
    }

    @ViewBuilder
    func pinchSupportRowSurface(isEnabled: Bool = true) -> some View {
        if #available(iOS 26, *) {
            self
                .glassEffect(
                    isEnabled ? .regular.interactive() : .regular,
                    in: .rect(cornerRadius: PinchGlassMetrics.controlCornerRadius)
                )
        } else {
            self
                .background(isEnabled ? Color.secondary.opacity(0.1) : Color.secondary.opacity(0.05))
                .clipShape(
                    RoundedRectangle(
                        cornerRadius: PinchGlassMetrics.controlCornerRadius,
                        style: .continuous
                    )
                )
        }
    }

    @ViewBuilder
    func pinchPrimarySheetPresentation() -> some View {
        if UIDevice.current.userInterfaceIdiom == .pad {
            self
                .presentationDetents([.large])
                .presentationSizing(.page)
                .presentationCornerRadius(0)
        } else {
            self
                .presentationDetents([.large])
                .presentationCornerRadius(32)
        }
    }
}
