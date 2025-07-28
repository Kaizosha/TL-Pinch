//
//  HowToEnable.swift
//  iOS (App)
//
//  Created by Kon on 7/28/25.
//

import SwiftUI
import StoreKit

struct AppButton: View {
    let app: SupportApp
    @State private var showAppStore = false
    
    var body: some View {
        Button(action: {
            guard let link = app.link else { return }
            
            if link.hasPrefix("http") {
                // It's a URL - open in Safari
                if let url = URL(string: link) {
                    UIApplication.shared.open(url)
                }
            } else {
                // It's an App Store ID - show App Store overlay
                showAppStore = true
            }
        }) {
            HStack(spacing: 12) {
                Image(systemName: app.iconName)
                    .font(.title2)
                    .frame(width: 30)
                
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
                }
            }
            .padding()
            .background(app.link != nil ? Color.secondary.opacity(0.1) : Color.secondary.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(app.link == nil)
        .appStoreOverlay(isPresented: $showAppStore) {
            SKOverlay.AppConfiguration(appIdentifier: app.link ?? "", position: .bottom)
        }
    }
}

struct HowToEnable: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                Text("How to Enable TL;Pinch in Safari")
                    .font(.title)
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top)
                
                VStack(alignment: .leading, spacing: 16) {
                    Text("Follow these steps:")
                        .font(.title3)
                        .fontWeight(.semibold)
                    
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Open the Settings app on your device.", systemImage: "gear")
                        Label("Scroll down and tap on Safari.", systemImage: "safari")
                        Label("Tap on Extensions.", systemImage: "puzzlepiece.extension")
                        Label("Find 'TL;Pinch' in the list and enable it.", systemImage: "checkmark.circle")
                        Label("Grant any required permissions.", systemImage: "hand.raised")
                    }
                    .font(.body)
                    .labelStyle(TitleAndIconLabelStyle())
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                Text("Once enabled, you can pinch to zoom with enhanced functionality in Safari!")
                    .font(.body)
                    .fontWeight(.medium)
                    .frame(maxWidth: .infinity, alignment: .leading)
                
                Divider()
                    .padding(.vertical)
                
                VStack(alignment: .leading, spacing: 16) {
                    Text("Support Kaizosha")
                        .font(.headline)
                        .fontWeight(.semibold)
                    
                    Text("Check out our other apps:")
                        .font(.body)
                        .foregroundStyle(.secondary)
                    
                    VStack(spacing: 16) {
                        ForEach(SupportAppsData.apps, id: \.name) { app in
                            AppButton(app: app)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                Spacer(minLength: 40)
            }
            .padding(.horizontal)
            .padding(.top, 24)
        }
    }
}

#Preview {
    HowToEnable()
}
