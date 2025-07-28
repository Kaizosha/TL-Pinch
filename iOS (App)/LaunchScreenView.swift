//
//  LaunchScreenView.swift
//  iOS (App)
//
//  Created by Kon on 7/28/25.
//

import SwiftUI
import UIKit

struct LaunchScreenView: View {
    @State private var showSheet: Bool = false
    @State private var animationStarted: Bool = false
    @State private var pinchScale: CGFloat = 1.0

    // Arrow start and end positions
    let startOffset1 = CGSize(width: 148, height: -340)
    let startOffset2 = CGSize(width: -148, height: 340)
    let meetPoint1 = CGSize(width: 22, height: -50)
    let meetPoint2 = CGSize(width: -22, height: 50)
    let pinchThreshold: CGFloat = 0.6

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Arrows
                Image(systemName: "arrow.down.left")
                    .resizable()
                    .frame(width: 45, height: 45)
                    .rotationEffect(.degrees(-21))
                    .offset(interpolatedOffset(start: startOffset1, end: meetPoint1))
                Image(systemName: "arrow.up.right")
                    .resizable()
                    .frame(width: 45, height: 45)
                    .rotationEffect(.degrees(-21))
                    .offset(interpolatedOffset(start: startOffset2, end: meetPoint2))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onAppear {
                // Start animation immediately
                if !animationStarted {
                    animationStarted = true
                    startAnimation()
                }
            }
            .sheet(isPresented: $showSheet, onDismiss: {
                let generator = UIImpactFeedbackGenerator(style: .heavy)
                generator.impactOccurred()
                
                // Reset and start animation immediately after sheet is dismissed
                animationStarted = false
                pinchScale = 1.0
                
                // Start animation immediately
                animationStarted = true
                startAnimation()
            }) {
                StartView()
            }
        }
    }
    
    // Interpolate between start and end based on pinch scale
    private func interpolatedOffset(start: CGSize, end: CGSize) -> CGSize {
        let t = min(max((1 - pinchScale) / (1 - pinchThreshold), 0), 1)
        let width = start.width + (end.width - start.width) * t
        let height = start.height + (end.height - start.height) * t
        return CGSize(width: width, height: height)
    }
    
    // Animation function to bring arrows together, trigger sheet, and move back to corners
    private func startAnimation() {
        // First animation: bring arrows together
        withAnimation(.easeInOut(duration: 1.5)) {
            pinchScale = pinchThreshold - 0.1 // Go below threshold to trigger
        }
        
        // When arrows meet, trigger sheet and move back to corners
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            let generator = UIImpactFeedbackGenerator(style: .heavy)
            generator.impactOccurred()
            showSheet = true
            
            // Move arrows back to corners
            withAnimation(.easeInOut(duration: 0.5)) {
                pinchScale = 1.0 // This moves arrows back to corners
            }
        }
    }
}

#Preview {
    LaunchScreenView()
} 
 
