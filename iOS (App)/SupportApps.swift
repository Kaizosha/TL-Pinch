//
//  SupportApps.swift
//  iOS (App)
//
//  Created by Kon on 7/28/25.
//

import Foundation

enum SupportAppBadge {
    case system(String)
    case text(String)
}

struct SupportApp {
    let name: String
    let description: String
    let link: String?
    let badge: SupportAppBadge
}

struct SupportAppsData {
    static let apps: [SupportApp] = [
        SupportApp(
            name: "Together",
            description: "nothing gets lost in translation. watch anything. hear everything.",
            link: nil,
            badge: .system("chevron.forward")
        ),
        SupportApp(
            name: "Hush",
            description: "while you're in the moment, it listens. it sees. it remembers.",
            link: "https://github.com/Kaizosha/Hush",
            badge: .text("^-^")
        ),
        SupportApp(
            name: "mind.",
            description: "coding agent that runs on your devices",
            link: nil,
            badge: .system("circle.dotted")
        ),
        SupportApp(
            name: "Morph",
            description: "the web, but how you want it.",
            link: nil,
            badge: .system("line.3.horizontal")
        ),
        SupportApp(
            name: "Browse",
            description: "the web, filtered through understanding.",
            link: nil,
            badge: .system("text.line.magnify")
        )
    ]
}
