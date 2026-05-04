//
//  TLPinchApp.swift
//  iOS (App)
//
//  Created by Codex on 4/22/26.
//

import SwiftUI
import TipKit

@main
struct TLPinchApp: App {
    init() {
        try? Tips.configure()
    }

    var body: some Scene {
        WindowGroup {
            LaunchScreenView()
        }
    }
}
