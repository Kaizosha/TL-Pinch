/*
TL;Pinch Extension - Background Script
======================================

Apple Intelligence only:
- Extract readable page content
- Bridge requests to the native Foundation Models handler
- Keep popup rendering compatible with structured JSON responses
*/

if (typeof browser === "undefined") {
    var browser = chrome;
}

const BackgroundLogger = {
    enabled: true,
    log(message, ...args) {
        if (this.enabled) {
            console.log("[TL;Pinch Background]", message, ...args);
        }
    },
    error(message, ...args) {
        console.error("[TL;Pinch Background]", message, ...args);
    }
};

const SAFARI_NATIVE_APP_ID = "com.kaizokonpaku.TL-Pinch";
const EXTRACTION_CHARACTER_LIMIT = 60_000;
const LEGACY_SETTINGS_KEYS = [
    "defaultProvider",
    "claudeApiKey",
    "openaiApiKey",
    "geminiApiKey",
    "claudeModel",
    "openaiModel",
    "geminiModel",
    "appleModel",
    "customSummaryPrompt",
    "customExplanationPrompt"
];

const TASK_TYPES = {
    SUMMARY: "summary",
    EXPLANATION: "explanation"
};

function normalizeInlineText(text) {
    return (text || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizePageText(text) {
    return (text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function isRestrictedUrl(value) {
    return /^(about:|chrome:|edge:|moz-extension:|safari-web-extension:)/i.test(value || "");
}

function formatErrorForUser(error) {
    if (error?.details && typeof error.details === "object") {
        return {
            title: error.details.title || "Apple Intelligence Error",
            message: error.details.message || error.message || "Unknown error",
            action: error.details.action || "Please try again in a moment.",
            fullError: error.details.fullError || error.message || String(error)
        };
    }

    return {
        title: "Apple Intelligence Error",
        message: error?.message || "Apple Intelligence could not complete this request.",
        action: "Please try again. If the issue continues, check Apple Intelligence on this device.",
        fullError: error?.stack || error?.message || String(error)
    };
}

class BrowserContentBridge {
    static async extractPageContent(tabId, pageUrl = "") {
        if (!tabId) {
            throw new Error("Missing tab ID for page extraction.");
        }

        if (isRestrictedUrl(pageUrl)) {
            throw new Error("TL;Pinch cannot read browser-internal pages.");
        }

        try {
            const response = await browser.tabs.sendMessage(tabId, { type: "extract_content" });
            if (response?.success && response.content?.text) {
                return response.content;
            }
        } catch (error) {
            BackgroundLogger.log("Content script extraction failed, using script injection fallback.", error);
        }

        const injectionResults = await browser.scripting.executeScript({
            target: { tabId },
            func: extractionLimit => {
                const selectors = [
                    "main",
                    "article",
                    "[role='main']",
                    ".content",
                    ".main-content",
                    ".post-content",
                    ".entry-content",
                    "#content",
                    "#main",
                    "body"
                ];

                let root = null;
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        root = element;
                        break;
                    }
                }

                const rawText = root?.innerText || root?.textContent || "";
                const text = rawText
                    .replace(/\r\n/g, "\n")
                    .replace(/\r/g, "\n")
                    .replace(/\u00a0/g, " ")
                    .replace(/[ \t]+/g, " ")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim()
                    .slice(0, extractionLimit);

                return {
                    title: document.title,
                    url: window.location.href,
                    text,
                    wordCount: text ? text.split(/\s+/).length : 0,
                    extractedAt: new Date().toISOString()
                };
            },
            args: [EXTRACTION_CHARACTER_LIMIT]
        });

        const result = injectionResults?.[0]?.result;
        if (!result?.text) {
            throw new Error("No readable content was found on this page.");
        }

        result.text = normalizePageText(result.text);
        return result;
    }
}

class AppleIntelligenceBridge {
    static async generateSummary(payload) {
        return AppleIntelligenceBridge.sendGenerationRequest("generate_summary", payload);
    }

    static async generateExplanation(payload) {
        return AppleIntelligenceBridge.sendGenerationRequest("generate_explanation", payload);
    }

    static async sendGenerationRequest(type, payload) {
        const response = await browser.runtime.sendNativeMessage(SAFARI_NATIVE_APP_ID, {
            type,
            ...payload
        });

        if (!response?.success) {
            const error = new Error(response?.error || "Apple Intelligence request failed.");
            if (response?.errorDetails && typeof response.errorDetails === "object") {
                error.details = response.errorDetails;
            }
            throw error;
        }

        return response;
    }
}

class TLBridge {
    static formatTaskResponse(taskType, nativeResponse) {
        const formattedContent = JSON.stringify(nativeResponse.response || {
            summary: "",
            topics: []
        });

        const payload = {
            success: true,
            strategy: nativeResponse.strategy || "apple-intelligence",
            sources: []
        };

        if (taskType === TASK_TYPES.EXPLANATION) {
            payload.explanation = formattedContent;
        } else {
            payload.summary = formattedContent;
        }

        return payload;
    }

    static async handleTask(taskType, request) {
        try {
            const content = await BrowserContentBridge.extractPageContent(request.tabId, request.url);
            const nativePayload = {
                title: normalizeInlineText(request.title || content.title || ""),
                url: normalizeInlineText(request.url || content.url || ""),
                pageText: normalizePageText(content.text || "")
            };

            let nativeResponse;

            if (taskType === TASK_TYPES.EXPLANATION) {
                nativePayload.selectedText = normalizeInlineText(request.selectedText || "");
                nativeResponse = await AppleIntelligenceBridge.generateExplanation(nativePayload);
            } else {
                nativeResponse = await AppleIntelligenceBridge.generateSummary(nativePayload);
            }

            return TLBridge.formatTaskResponse(taskType, nativeResponse);
        } catch (error) {
            BackgroundLogger.error(`Apple Intelligence ${taskType} request failed:`, error);
            const formattedError = formatErrorForUser(error);

            return {
                success: false,
                error: formattedError.message,
                errorDetails: formattedError
            };
        }
    }
}

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    try {
        switch (message.type) {
            case "show_toolbar_popup":
                await browser.action.openPopup();
                sendResponse({ success: true });
                break;

            case "summarize_page":
                sendResponse(await TLBridge.handleTask(TASK_TYPES.SUMMARY, message));
                break;

            case "explain_selected_text":
                sendResponse(await TLBridge.handleTask(TASK_TYPES.EXPLANATION, message));
                break;

            default:
                sendResponse({ success: false, error: "Unknown message type" });
        }
    } catch (error) {
        BackgroundLogger.error("Error in background message handler:", error);
        sendResponse({ success: false, error: error.message });
    }

    return true;
});

browser.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.action === "determineID") {
        sendResponse({ response: "Extension installed" });
    }
});

async function initializeBackground() {
    await browser.storage.local.remove(LEGACY_SETTINGS_KEYS);
    BackgroundLogger.log("Apple Intelligence background initialized.");
}

initializeBackground().catch(error => {
    BackgroundLogger.error("Failed to initialize Apple Intelligence background:", error);
});
