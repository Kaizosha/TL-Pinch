//
//  SupportApps.swift
//  iOS (App)
//
//  Created by Kon on 7/28/25.
//

import Foundation

struct SupportApp {
    let name: String
    let description: String
    let status: String
    let link: String?
    let iconName: String
}

struct SupportAppsData {
    static let apps: [SupportApp] = [
        SupportApp(
            name: "Hush",
            description: "while you're in the moment, it listens. it sees. it remembers.",
            status: "HX09",
            link: "https://github.com/Kaizosha/Hush",
            iconName: "eyes"
        ),
        SupportApp(
            name: "TL;Pinch",
            description: "Pinch to see less, know more - Summarize web pages and explain selected text with AI",
            status: "TLP01",
            link: "535886823",
            iconName: "arrow.up.forward.and.arrow.down.backward"
        ),
        SupportApp(
            name: "Morph",
            description: "Coming soon",
            status: "MX01",
            link: nil,
            iconName: "line.3.horizontal"
        ),
        SupportApp(
            name: "Browse",
            description: "The web, filtered through understanding. - Browse with AI that knows what you mean and finds what matters",
            status: "BX01",
            link: nil,
            iconName: "text.line.magnify"
        ),
        SupportApp(
            name: "mind",
            description: "Coming soon",
            status: "Coming soon",
            link: nil,
            iconName: "circle.dotted"
        )
    ]
}
