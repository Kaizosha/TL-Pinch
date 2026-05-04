//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Kon on 7/28/25.
//

import FoundationModels
import SafariServices
import os.log

private enum NativeMessageType: String {
    case generateSummary = "generate_summary"
    case generateExplanation = "generate_explanation"
}

private enum AppleTaskKind {
    case summary
    case explanation

    var defaultInstructions: String {
        switch self {
        case .summary:
            return """
            Summarize webpage content clearly, accurately, and concisely.
            Keep the answer useful for someone scanning quickly.
            Use only information supported by the provided page text.
            """
        case .explanation:
            return """
            Explain what the selected webpage text is about and what it means.
            Treat the selected text as the primary subject, not the whole page.
            Use nearby page context only when it helps resolve references, jargon, or missing context.
            Keep the answer concise, grounded, and easy to understand.
            Do not turn the answer into a summary of the entire page.
            """
        }
    }

    var responseDescription: String {
        switch self {
        case .summary:
            return "A concise webpage summary with a short list of useful supporting topics."
        case .explanation:
            return "A concise explanation of what the selected webpage text is about, with supporting topics."
        }
    }

    var topicsRange: ClosedRange<Int> {
        switch self {
        case .summary:
            return 3 ... 4
        case .explanation:
            return 2 ... 4
        }
    }

    var maximumResponseTokens: Int {
        switch self {
        case .summary:
            return 700
        case .explanation:
            return 640
        }
    }
}

private struct StructuredTopic {
    let heading: String
    let description: String

    var payload: [String: String] {
        [
            "heading": heading,
            "description": description
        ]
    }
}

private struct StructuredResponse {
    let summary: String
    let topics: [StructuredTopic]

    var payload: [String: Any] {
        [
            "summary": summary,
            "topics": topics.map(\.payload)
        ]
    }

    var synthesisText: String {
        let topicLines = topics.map { topic in
            "- \(topic.heading): \(topic.description)"
        }.joined(separator: "\n")

        if topicLines.isEmpty {
            return "Summary: \(summary)"
        }

        return """
        Summary: \(summary)
        Topics:
        \(topicLines)
        """
    }
}

private struct GenerationRequest {
    let title: String
    let url: String
    let pageText: String
    let selectedText: String?

    init(message: [String: Any], task: AppleTaskKind) {
        title = NativeResponseBuilder.normalizeInlineText(message["title"] as? String)
        url = NativeResponseBuilder.normalizeInlineText(message["url"] as? String)
        pageText = NativeResponseBuilder.normalizePageText(message["pageText"] as? String)

        switch task {
        case .summary:
            selectedText = nil
        case .explanation:
            let value = NativeResponseBuilder.normalizeInlineText(message["selectedText"] as? String)
            selectedText = value.isEmpty ? nil : value
        }
    }
}

private enum NativeResponseBuilder {
    private static let summaryChunkCharacterFloor = 1_800
    private static let summaryChunkCharacterFallback = 6_400
    private static let summaryChunkCharacterCeiling = 11_000
    private static let explanationContextCharacterLimit = 3_800
    private static let explanationSelectionCharacterLimit = 1_800

    static func generateSummary(from message: [String: Any]) async -> [String: Any] {
        let request = GenerationRequest(message: message, task: .summary)

        guard !request.pageText.isEmpty else {
            return failurePayload(
                title: "No Readable Content",
                message: "TL;Pinch could not find enough readable text on this page to summarize.",
                action: "Try refreshing the page or summarizing a page with more readable content."
            )
        }

        return await generateStructuredResponse(for: .summary, request: request)
    }

    static func generateExplanation(from message: [String: Any]) async -> [String: Any] {
        let request = GenerationRequest(message: message, task: .explanation)

        guard let selectedText = request.selectedText, !selectedText.isEmpty else {
            return failurePayload(
                title: "No Selected Text",
                message: "Select text on the page, then try again.",
                action: "Highlight the text you want explained before opening TL;Pinch."
            )
        }

        guard !request.pageText.isEmpty else {
            return failurePayload(
                title: "No Readable Context",
                message: "TL;Pinch could not find enough page text to explain the selected passage in context.",
                action: "Try refreshing the page or selecting text from a page with more readable content.",
                fullError: selectedText
            )
        }

        return await generateStructuredResponse(for: .explanation, request: request)
    }

    private static func generateStructuredResponse(for task: AppleTaskKind, request: GenerationRequest) async -> [String: Any] {
        let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
        let availability = model.availability

        guard model.isAvailable else {
            return failurePayload(
                title: "Apple Intelligence Unavailable",
                message: describeAvailability(availability),
                action: availabilityAction(availability),
                fullError: "Model availability: \(String(describing: availability))",
                available: false
            )
        }

        guard model.supportsLocale() else {
            return failurePayload(
                title: "Unsupported Language or Locale",
                message: "Apple Intelligence does not support the current device language or locale for this request.",
                action: "Switch to a supported Apple Intelligence language or locale, then try again.",
                fullError: "Unsupported locale: \(Locale.current.identifier)"
            )
        }

        do {
            let instructions = buildInstructions(for: task)
            let schema = try responseSchema(for: task)
            let options = GenerationOptions(
                sampling: .greedy,
                maximumResponseTokens: task.maximumResponseTokens
            )

            switch task {
            case .summary:
                let response = try await generateSummaryResponse(
                    request: request,
                    model: model,
                    instructions: instructions,
                    schema: schema,
                    options: options
                )

                return [
                    "success": true,
                    "available": true,
                    "response": response.payload,
                    "strategy": summaryStrategy(for: request.pageText, response: response)
                ]

            case .explanation:
                let response = try await generateExplanationResponse(
                    request: request,
                    model: model,
                    instructions: instructions,
                    schema: schema,
                    options: options
                )

                return [
                    "success": true,
                    "available": true,
                    "response": response.payload,
                    "strategy": "apple-intelligence-explanation"
                ]
            }
        } catch let error as LanguageModelSession.GenerationError {
            return generationErrorPayload(error, availability: availability)
        } catch {
            return failurePayload(
                title: "Apple Intelligence Request Failed",
                message: "Apple Intelligence could not complete this request.",
                action: "Please try again. If this keeps happening, try a shorter request.",
                fullError: describe(error: error)
            )
        }
    }

    private static func generateSummaryResponse(
        request: GenerationRequest,
        model: SystemLanguageModel,
        instructions: Instructions,
        schema: GenerationSchema,
        options: GenerationOptions
    ) async throws -> StructuredResponse {
        let promptBudget = await promptTokenBudget(
            for: model,
            instructions: instructions,
            schema: schema,
            responseTokens: AppleTaskKind.summary.maximumResponseTokens
        )
        let chunks = await summaryChunks(for: request.pageText, model: model, promptBudget: promptBudget)

        if chunks.count == 1, let chunk = chunks.first {
            let prompt = buildSummaryPrompt(request: request, pageText: chunk, segmentIndex: nil, segmentCount: nil)
            return try await generateStructuredContent(
                model: model,
                instructions: instructions,
                schema: schema,
                options: options,
                prompt: prompt
            )
        }

        let segmentInstructions = buildInstructions(
            for: .summary,
            prepend: "You are summarizing one chunk from a longer page. Capture only the information supported by that chunk."
        )
        let segmentOptions = GenerationOptions(
            sampling: .greedy,
            maximumResponseTokens: 520
        )

        let segmentResponses = try await chunks.enumerated().asyncMap { index, chunk in
            let prompt = buildSummaryPrompt(
                request: request,
                pageText: chunk,
                segmentIndex: index + 1,
                segmentCount: chunks.count
            )

            return try await generateStructuredContent(
                model: model,
                instructions: segmentInstructions,
                schema: schema,
                options: segmentOptions,
                prompt: prompt
            )
        }

        let synthesisPrompt = buildSummarySynthesisPrompt(request: request, partialResponses: segmentResponses)
        return try await generateStructuredContent(
            model: model,
            instructions: instructions,
            schema: schema,
            options: options,
            prompt: synthesisPrompt
        )
    }

    private static func generateExplanationResponse(
        request: GenerationRequest,
        model: SystemLanguageModel,
        instructions: Instructions,
        schema: GenerationSchema,
        options: GenerationOptions
    ) async throws -> StructuredResponse {
        let selectedText = truncateWithEllipsis(
            request.selectedText ?? "",
            maxCharacters: explanationSelectionCharacterLimit
        )
        let initialContext = contextualExcerpt(for: request, maxCharacters: explanationContextCharacterLimit)
        let promptBudget = await promptTokenBudget(
            for: model,
            instructions: instructions,
            schema: schema,
            responseTokens: AppleTaskKind.explanation.maximumResponseTokens
        )
        let fittedContext = await fittedExplanationContext(
            initialContext,
            request: request,
            model: model,
            promptBudget: promptBudget
        )

        let prompt = buildExplanationPrompt(
            request: request,
            selectedText: selectedText,
            context: fittedContext
        )

        return try await generateStructuredContent(
            model: model,
            instructions: instructions,
            schema: schema,
            options: options,
            prompt: prompt
        )
    }

    private static func generateStructuredContent(
        model: SystemLanguageModel,
        instructions: Instructions,
        schema: GenerationSchema,
        options: GenerationOptions,
        prompt: String
    ) async throws -> StructuredResponse {
        let session = LanguageModelSession(model: model, instructions: instructions)
        let response = try await session.respond(
            to: prompt,
            schema: schema,
            options: options
        )

        return try parseStructuredResponse(response.content)
    }

    private static func buildInstructions(
        for task: AppleTaskKind,
        prepend: String? = nil
    ) -> Instructions {
        let prefix = prepend.map { "\($0)\n" } ?? ""
        return Instructions("\(prefix)\(task.defaultInstructions)")
    }

    private static func responseSchema(for task: AppleTaskKind) throws -> GenerationSchema {
        let topicSchema = DynamicGenerationSchema(
            name: "Topic",
            description: "A concise supporting point.",
            properties: [
                .init(
                    name: "heading",
                    description: "A short heading, usually a few words.",
                    schema: DynamicGenerationSchema(type: String.self)
                ),
                .init(
                    name: "description",
                    description: "One or two concise sentences explaining why the topic matters.",
                    schema: DynamicGenerationSchema(type: String.self)
                )
            ]
        )

        let rootSchema = DynamicGenerationSchema(
            name: "StructuredResponse",
            description: task.responseDescription,
            properties: [
                .init(
                    name: "summary",
                    description: task == .summary
                        ? "A concise summary in two or three sentences."
                        : "A concise explanation in two or three sentences of what the selected text is about and what it means.",
                    schema: DynamicGenerationSchema(type: String.self)
                ),
                .init(
                    name: "topics",
                    description: task == .summary
                        ? "A short list of helpful supporting topics."
                        : "A short list of helpful supporting points that clarify the selected text.",
                    schema: DynamicGenerationSchema(
                        arrayOf: DynamicGenerationSchema(referenceTo: "Topic"),
                        minimumElements: task.topicsRange.lowerBound,
                        maximumElements: task.topicsRange.upperBound
                    )
                )
            ]
        )

        return try GenerationSchema(root: rootSchema, dependencies: [topicSchema])
    }

    private static func parseStructuredResponse(_ content: GeneratedContent) throws -> StructuredResponse {
        let summary = normalizeInlineText(try content.value(String.self, forProperty: "summary"))
        let topicContents = try content.value([GeneratedContent].self, forProperty: "topics")

        let topics = try topicContents.compactMap { topicContent -> StructuredTopic? in
            let heading = normalizeInlineText(try topicContent.value(String.self, forProperty: "heading"))
            let description = normalizeInlineText(try topicContent.value(String.self, forProperty: "description"))

            guard !heading.isEmpty, !description.isEmpty else {
                return nil
            }

            return StructuredTopic(heading: heading, description: description)
        }

        return StructuredResponse(
            summary: summary,
            topics: topics
        )
    }

    private static func buildSummaryPrompt(
        request: GenerationRequest,
        pageText: String,
        segmentIndex: Int?,
        segmentCount: Int?
    ) -> String {
        var prompt = """
        Page title: \(request.title)
        Page URL: \(request.url)
        """

        if let segmentIndex, let segmentCount {
            prompt += "\nThis is segment \(segmentIndex) of \(segmentCount) from a longer page."
        }

        prompt += """

        Summarize the provided page text.
        If the text is partial, say only what is supported by the content.

        Page text:
        \(pageText)
        """

        return prompt
    }

    private static func buildSummarySynthesisPrompt(
        request: GenerationRequest,
        partialResponses: [StructuredResponse]
    ) -> String {
        let renderedSegments = partialResponses.enumerated().map { index, response in
            """
            Segment \(index + 1):
            \(response.synthesisText)
            """
        }.joined(separator: "\n\n")

        return """
        Page title: \(request.title)
        Page URL: \(request.url)

        You are combining chunk-level summaries from one webpage into a single final answer.
        Remove duplication, keep only the most useful ideas, and preserve nuance when the page is partial or mixed.

        Chunk summaries:
        \(renderedSegments)
        """
    }

    private static func buildExplanationPrompt(
        request: GenerationRequest,
        selectedText: String,
        context: String
    ) -> String {
        let contextBlock = context.isEmpty ? "No additional page context was extracted." : context

        return """
        Page title: \(request.title)
        Page URL: \(request.url)
        Selected text: \(selectedText)

        Explain what the selected text is about and what it means.
        Answer as if the user highlighted this passage and asked, "What is this about?"
        Focus on the selected text first.
        Use the page context only when it helps clarify meaning, references, assumptions, or omitted details.
        Do not broaden into a summary of the whole page.
        If the selected text is a fragment, explain its likely role and meaning in context.

        Nearby page context:
        \(contextBlock)
        """
    }

    private static func promptTokenBudget(
        for model: SystemLanguageModel,
        instructions: Instructions,
        schema: GenerationSchema,
        responseTokens: Int
    ) async -> Int {
        var reservedTokens = responseTokens + 220

        if #available(iOS 26.4, macOS 26.4, *) {
            reservedTokens += (try? await model.tokenCount(for: instructions)) ?? 0
            reservedTokens += (try? await model.tokenCount(for: schema)) ?? 0
        } else {
            reservedTokens += 900
        }

        return max(model.contextSize - reservedTokens, 900)
    }

    private static func summaryChunks(
        for pageText: String,
        model: SystemLanguageModel,
        promptBudget: Int
    ) async -> [String] {
        guard !pageText.isEmpty else {
            return []
        }

        if await textFitsPromptBudget(pageText, model: model, promptBudget: promptBudget) {
            return [pageText]
        }

        let initialChunks = splitText(
            pageText,
            maxCharacters: await summaryChunkCharacterBudget(
                for: pageText,
                model: model,
                promptBudget: promptBudget
            )
        )

        var refinedChunks: [String] = []
        for chunk in initialChunks {
            refinedChunks.append(contentsOf: await splitChunkToFitPromptBudget(chunk, model: model, promptBudget: promptBudget))
        }

        return refinedChunks.filter { !$0.isEmpty }
    }

    private static func summaryChunkCharacterBudget(
        for text: String,
        model: SystemLanguageModel,
        promptBudget: Int
    ) async -> Int {
        if #available(iOS 26.4, macOS 26.4, *) {
            let totalTokens = (try? await model.tokenCount(for: text)) ?? 0
            if totalTokens > 0 {
                let estimate = Int(Double(text.count) * Double(promptBudget) / Double(totalTokens))
                return min(max(estimate, summaryChunkCharacterFloor), summaryChunkCharacterCeiling)
            }
        }

        return summaryChunkCharacterFallback
    }

    private static func splitChunkToFitPromptBudget(
        _ text: String,
        model: SystemLanguageModel,
        promptBudget: Int
    ) async -> [String] {
        guard !text.isEmpty else {
            return []
        }

        if await textFitsPromptBudget(text, model: model, promptBudget: promptBudget) || text.count < summaryChunkCharacterFloor {
            return [text]
        }

        let midpoint = max(text.count / 2, 1)
        let splitIndex = preferredSplitIndex(in: text, around: midpoint)
        let left = String(text[..<splitIndex]).trimmingCharacters(in: .whitespacesAndNewlines)
        let right = String(text[splitIndex...]).trimmingCharacters(in: .whitespacesAndNewlines)

        if left.isEmpty || right.isEmpty {
            return [truncateWithEllipsis(text, maxCharacters: summaryChunkCharacterFallback)]
        }

        let leftChunks = await splitChunkToFitPromptBudget(left, model: model, promptBudget: promptBudget)
        let rightChunks = await splitChunkToFitPromptBudget(right, model: model, promptBudget: promptBudget)
        return leftChunks + rightChunks
    }

    private static func textFitsPromptBudget(
        _ text: String,
        model: SystemLanguageModel,
        promptBudget: Int
    ) async -> Bool {
        if #available(iOS 26.4, macOS 26.4, *) {
            let tokens = (try? await model.tokenCount(for: text)) ?? (text.count / 4)
            return tokens <= promptBudget
        }

        return text.count <= promptBudget * 4
    }

    private static func splitText(_ text: String, maxCharacters: Int) -> [String] {
        guard text.count > maxCharacters else {
            return [text]
        }

        var chunks: [String] = []
        var currentStart = text.startIndex

        while currentStart < text.endIndex {
            let proposedEnd = text.index(
                currentStart,
                offsetBy: maxCharacters,
                limitedBy: text.endIndex
            ) ?? text.endIndex

            if proposedEnd == text.endIndex {
                let chunk = String(text[currentStart..<proposedEnd]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !chunk.isEmpty {
                    chunks.append(chunk)
                }
                break
            }

            let window = String(text[currentStart..<proposedEnd])
            let splitIndex = preferredSplitIndex(
                in: window,
                around: min(maxCharacters, max(window.count - 1, 1))
            )
            let offset = window.distance(from: window.startIndex, to: splitIndex)
            let absoluteSplitIndex = text.index(currentStart, offsetBy: offset)
            let chunk = String(text[currentStart..<absoluteSplitIndex]).trimmingCharacters(in: .whitespacesAndNewlines)

            if chunk.isEmpty {
                let fallbackChunk = String(text[currentStart..<proposedEnd]).trimmingCharacters(in: .whitespacesAndNewlines)
                chunks.append(fallbackChunk)
                currentStart = proposedEnd
            } else {
                chunks.append(chunk)
                currentStart = absoluteSplitIndex
            }
        }

        return chunks
    }

    private static func preferredSplitIndex(in text: String, around offset: Int) -> String.Index {
        guard !text.isEmpty else {
            return text.startIndex
        }

        let constrainedOffset = min(max(offset, 1), text.count - 1)
        let center = text.index(text.startIndex, offsetBy: constrainedOffset)
        let lowerBound = text.index(text.startIndex, offsetBy: max(constrainedOffset - (text.count / 3), 0))

        let candidates = ["\n\n", ". ", "! ", "? ", "; "]
        for candidate in candidates {
            if let range = text.range(of: candidate, options: .backwards, range: lowerBound..<center) {
                return range.upperBound
            }
        }

        return center
    }

    private static func contextualExcerpt(for request: GenerationRequest, maxCharacters: Int) -> String {
        let pageText = request.pageText
        guard !pageText.isEmpty else {
            return ""
        }

        guard let selectedText = request.selectedText, !selectedText.isEmpty else {
            return truncateWithEllipsis(pageText, maxCharacters: maxCharacters)
        }

        if let range = pageText.range(of: selectedText, options: [.caseInsensitive, .diacriticInsensitive]) {
            let lowerBound = pageText.index(
                range.lowerBound,
                offsetBy: -(maxCharacters / 2),
                limitedBy: pageText.startIndex
            ) ?? pageText.startIndex
            let upperBound = pageText.index(
                range.upperBound,
                offsetBy: maxCharacters / 2,
                limitedBy: pageText.endIndex
            ) ?? pageText.endIndex

            return String(pageText[lowerBound..<upperBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return truncateWithEllipsis(pageText, maxCharacters: maxCharacters)
    }

    private static func fittedExplanationContext(
        _ context: String,
        request: GenerationRequest,
        model: SystemLanguageModel,
        promptBudget: Int
    ) async -> String {
        guard !context.isEmpty else {
            return ""
        }

        var candidate = context
        while !candidate.isEmpty {
            let prompt = buildExplanationPrompt(
                request: request,
                selectedText: truncateWithEllipsis(request.selectedText ?? "", maxCharacters: explanationSelectionCharacterLimit),
                context: candidate
            )

            if await textFitsPromptBudget(prompt, model: model, promptBudget: promptBudget) {
                return candidate
            }

            let shortenedCount = max(candidate.count * 3 / 4, 600)
            candidate = truncateWithEllipsis(candidate, maxCharacters: shortenedCount)
        }

        return ""
    }

    private static func truncateWithEllipsis(_ text: String, maxCharacters: Int) -> String {
        guard text.count > maxCharacters else {
            return text
        }

        let endIndex = text.index(text.startIndex, offsetBy: maxCharacters)
        return String(text[..<endIndex]).trimmingCharacters(in: .whitespacesAndNewlines) + "..."
    }

    static func normalizeInlineText(_ text: String?) -> String {
        (text ?? "")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func normalizePageText(_ text: String?) -> String {
        (text ?? "")
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
            .replacingOccurrences(of: #"[ \t]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func summaryStrategy(for pageText: String, response: StructuredResponse) -> String {
        let hasTopics = !response.topics.isEmpty
        let isLongPage = pageText.count > summaryChunkCharacterFallback
        if isLongPage && hasTopics {
            return "apple-intelligence-chunked-summary"
        }

        return "apple-intelligence-guided-summary"
    }

    static func failurePayload(
        title: String,
        message: String,
        action: String,
        fullError: String? = nil,
        available: Bool = true
    ) -> [String: Any] {
        [
            "success": false,
            "available": available,
            "error": message,
            "errorDetails": [
                "title": title,
                "message": message,
                "action": action,
                "fullError": fullError ?? message
            ]
        ]
    }

    private static func describeAvailability(_ availability: SystemLanguageModel.Availability) -> String {
        switch availability {
        case .available:
            return "Apple Intelligence is available."
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible:
                return "This device is not eligible for Apple Intelligence."
            case .appleIntelligenceNotEnabled:
                return "Apple Intelligence is turned off on this device."
            case .modelNotReady:
                return "Apple Intelligence is still preparing its on-device model."
            @unknown default:
                return "Apple Intelligence is unavailable on this device right now."
            }
        @unknown default:
            return "Apple Intelligence availability could not be determined."
        }
    }

    private static func availabilityAction(_ availability: SystemLanguageModel.Availability) -> String {
        switch availability {
        case .available:
            return "Please try again in a moment."
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible:
                return "Use a supported device with Apple Intelligence enabled."
            case .appleIntelligenceNotEnabled:
                return "Turn on Apple Intelligence in system settings, then try again."
            case .modelNotReady:
                return "Wait for Apple Intelligence to finish preparing its model, then try again."
            @unknown default:
                return "Check Apple Intelligence in system settings, then try again."
            }
        @unknown default:
            return "Check Apple Intelligence in system settings, then try again."
        }
    }

    private static func generationErrorPayload(
        _ error: LanguageModelSession.GenerationError,
        availability: SystemLanguageModel.Availability
    ) -> [String: Any] {
        switch error {
        case .exceededContextWindowSize(let context):
            return failurePayload(
                title: "Prompt Too Large",
                message: "The Apple Intelligence request is too large for the on-device model.",
                action: "Try a shorter selection or summarize a smaller section of the page.",
                fullError: context.debugDescription
            )
        case .assetsUnavailable(let context):
            return failurePayload(
                title: "Model Assets Unavailable",
                message: describeAvailability(availability),
                action: availabilityAction(availability),
                fullError: context.debugDescription,
                available: false
            )
        case .guardrailViolation(let context):
            return failurePayload(
                title: "Request Blocked",
                message: "Apple Intelligence blocked this request because of its safety guardrails.",
                action: "Try rephrasing the request and avoid sensitive or disallowed content.",
                fullError: context.debugDescription
            )
        case .unsupportedGuide(let context):
            return failurePayload(
                title: "Response Formatting Failed",
                message: "Apple Intelligence could not use the requested structured response format.",
                action: "Please try again.",
                fullError: context.debugDescription
            )
        case .unsupportedLanguageOrLocale(let context):
            return failurePayload(
                title: "Unsupported Language or Locale",
                message: "Apple Intelligence does not support the current language or locale for this request.",
                action: "Switch to a supported Apple Intelligence language or locale, then try again.",
                fullError: context.debugDescription
            )
        case .decodingFailure(let context):
            return failurePayload(
                title: "Response Parsing Failed",
                message: "Apple Intelligence generated a response that could not be parsed cleanly.",
                action: "Please try again.",
                fullError: context.debugDescription
            )
        case .rateLimited(let context):
            return failurePayload(
                title: "Too Many Requests",
                message: "Apple Intelligence is temporarily rate limited.",
                action: "Wait a moment, then try again.",
                fullError: context.debugDescription
            )
        case .concurrentRequests(let context):
            return failurePayload(
                title: "Request Already In Progress",
                message: "Apple Intelligence is already handling another request.",
                action: "Wait for the current request to finish, then try again.",
                fullError: context.debugDescription
            )
        case .refusal(_, let context):
            return failurePayload(
                title: "Request Refused",
                message: "Apple Intelligence refused to answer this request.",
                action: "Try rephrasing the request.",
                fullError: context.debugDescription
            )
        @unknown default:
            return failurePayload(
                title: "Apple Intelligence Request Failed",
                message: "Apple Intelligence could not complete this request.",
                action: "Please try again.",
                fullError: describe(error: error)
            )
        }
    }

    private static func describe(error: Error) -> String {
        let nsError = error as NSError
        let localizedError = error as? LocalizedError
        let candidates: [String?] = [
            localizedError?.errorDescription ?? error.localizedDescription,
            localizedError?.failureReason,
            localizedError?.recoverySuggestion,
            "NSError(domain: \(nsError.domain), code: \(nsError.code))"
        ]

        return candidates
            .compactMap { candidate in
                guard let candidate, !candidate.isEmpty else {
                    return nil
                }

                return candidate
            }
            .joined(separator: " | ")
    }
}

private extension Sequence {
    func asyncMap<T>(
        _ transform: (Element) async throws -> T
    ) async rethrows -> [T] {
        var result: [T] = []
        for element in self {
            result.append(try await transform(element))
        }
        return result
    }
}

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        let rawMessage = request?.userInfo?[SFExtensionMessageKey]

        os_log(
            .default,
            "Received native message: %@ (profile: %@)",
            String(describing: rawMessage),
            profile?.uuidString ?? "none"
        )

        guard
            let message = rawMessage as? [String: Any],
            let typeName = message["type"] as? String,
            let type = NativeMessageType(rawValue: typeName)
        else {
            completeRequest(
                for: context,
                payload: [
                    "success": false,
                    "error": "Unsupported native message."
                ]
            )
            return
        }

        Task {
            let payload: [String: Any]

            switch type {
            case .generateSummary:
                payload = await NativeResponseBuilder.generateSummary(from: message)
            case .generateExplanation:
                payload = await NativeResponseBuilder.generateExplanation(from: message)
            }

            completeRequest(for: context, payload: payload)
        }
    }

    private func completeRequest(for context: NSExtensionContext, payload: [String: Any]) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: payload]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
