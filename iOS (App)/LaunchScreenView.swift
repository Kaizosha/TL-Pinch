//
//  LaunchScreenView.swift
//  iOS (App)
//
//  Created by Kon on 7/28/25.
//

import SwiftUI

struct LaunchScreenView: View {
    @State private var showSheet = false
    @State private var animationStarted = false
    @State private var pinchScale: CGFloat = 1.0
    @State private var feedbackTrigger = 0
    @State private var animationTask: Task<Void, Never>?

    @ScaledMetric(relativeTo: .largeTitle) private var arrowSize = 45
    @ScaledMetric(relativeTo: .largeTitle) private var startHorizontalOffset = 148
    @ScaledMetric(relativeTo: .largeTitle) private var startVerticalOffset = 340
    @ScaledMetric(relativeTo: .title2) private var meetHorizontalOffset = 22
    @ScaledMetric(relativeTo: .title2) private var meetVerticalOffset = 50

    private let pinchThreshold: CGFloat = 0.6

    var body: some View {
        GeometryReader { _ in
            ZStack {
                Image(systemName: "arrow.down.left")
                    .resizable()
                    .frame(width: arrowSize, height: arrowSize)
                    .rotationEffect(.degrees(-21))
                    .offset(
                        interpolatedOffset(
                            start: CGSize(width: startHorizontalOffset, height: -startVerticalOffset),
                            end: CGSize(width: meetHorizontalOffset, height: -meetVerticalOffset)
                        )
                    )

                Image(systemName: "arrow.up.right")
                    .resizable()
                    .frame(width: arrowSize, height: arrowSize)
                    .rotationEffect(.degrees(-21))
                    .offset(
                        interpolatedOffset(
                            start: CGSize(width: -startHorizontalOffset, height: startVerticalOffset),
                            end: CGSize(width: -meetHorizontalOffset, height: meetVerticalOffset)
                        )
                    )
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .sensoryFeedback(.impact(weight: .heavy), trigger: feedbackTrigger)
            .onAppear {
                guard !animationStarted else {
                    return
                }

                animationStarted = true
                startAnimation()
            }
            .onDisappear {
                animationTask?.cancel()
            }
            .sheet(isPresented: $showSheet, onDismiss: {
                feedbackTrigger += 1
                animationStarted = false
                pinchScale = 1.0
                animationStarted = true
                startAnimation()
            }) {
                StartView()
                    .pinchPrimarySheetPresentation()
            }
        }
    }

    private func interpolatedOffset(start: CGSize, end: CGSize) -> CGSize {
        let progress = min(max((1 - pinchScale) / (1 - pinchThreshold), 0), 1)
        let width = start.width + (end.width - start.width) * progress
        let height = start.height + (end.height - start.height) * progress
        return CGSize(width: width, height: height)
    }

    private func startAnimation() {
        animationTask?.cancel()

        withAnimation(.easeInOut(duration: 1.5)) {
            pinchScale = pinchThreshold - 0.1
        }

        animationTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.5))

            guard !Task.isCancelled else {
                return
            }

            feedbackTrigger += 1
            showSheet = true

            withAnimation(.easeInOut(duration: 0.5)) {
                pinchScale = 1.0
            }
        }
    }
}

#Preview {
    LaunchScreenView()
}
