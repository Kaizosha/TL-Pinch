if (typeof browser === "undefined") {
    var browser = chrome;
}

const ELEMENTS = {
    summaryResult: "summaryResult",
    footer: "footer",
    footerRefreshButton: "footerRefreshButton"
};

const MESSAGE_TYPES = {
    explainSelectedText: "explain_selected_text",
    summarizePage: "summarize_page"
};

const Logger = {
    enabled: true,
    log(message, ...args) {
        if (this.enabled) {
            console.log("[TL;Pinch Popup]", message, ...args);
        }
    },
    error(message, ...args) {
        console.error("[TL;Pinch Popup]", message, ...args);
    }
};

class TextSelectionHelper {
    static getSelectedText() {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
            return selection.toString().trim();
        }

        const activeElement = document.activeElement;
        if (
            activeElement &&
            (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
        ) {
            const start = activeElement.selectionStart;
            const end = activeElement.selectionEnd;
            if (start !== end) {
                const selectedText = activeElement.value.substring(start, end).trim();
                if (selectedText) {
                    return selectedText;
                }
            }
        }

        if (selection && selection.rangeCount > 0) {
            for (let index = 0; index < selection.rangeCount; index += 1) {
                const text = selection.getRangeAt(index).toString().trim();
                if (text) {
                    return text;
                }
            }
        }

        return null;
    }
}

class UIHelper {
    static getElement(id) {
        return document.getElementById(id);
    }

    static showElement(id) {
        const element = this.getElement(id);
        if (element) {
            element.style.display = "block";
        }
    }

    static hideElement(id) {
        const element = this.getElement(id);
        if (element) {
            element.style.display = "none";
        }
    }

    static setContent(id, content) {
        const element = this.getElement(id);
        if (element) {
            element.innerHTML = content;
        }
    }

    static showLoading(id, type = "summarizing") {
        const loadingText = type === "explaining"
            ? "explaining for you"
            : "summarizing for you";

        window.scrollTo({ top: 0, behavior: "smooth" });
        this.setContent(id, `
            <div class="loading loading-centered">
                <div class="loading-bloom">
                    <span class="loading-text">${loadingText}</span>
                </div>
            </div>
        `);
        this.showElement(id);
    }

    static showError(id, message, errorDetails = null) {
        const title = errorDetails && typeof errorDetails === "object"
            ? (errorDetails.title || "Couldn't Complete This Request")
            : "Couldn't Complete This Request";
        const body = errorDetails && typeof errorDetails === "object"
            ? (errorDetails.message || message)
            : message;
        const hint = errorDetails && typeof errorDetails === "object"
            ? (errorDetails.action || "")
            : "";
        const titleHTML = title && title !== body
            ? `<div class="error-title">${this.escapeHtml(title)}</div>`
            : "";

        const errorHTML = `
            <div class="error-container">
                <div class="error-label">Apple Intelligence</div>
                ${titleHTML}
                <div class="error-message">${this.escapeHtml(body)}</div>
                ${hint ? `<div class="error-hint">${this.escapeHtml(hint)}</div>` : ""}
            </div>
        `;

        this.setContent(id, errorHTML);
        this.showElement(id);
    }

    static showSuccess(id, content, forceTextOnly = false, header = null, sources = []) {
        let formattedContent;

        if (forceTextOnly) {
            formattedContent = AIResponseFormatter.format(content);
        } else {
            const parsedResponse = AIResponseFormatter.parseStructuredResponse(content);
            formattedContent = parsedResponse.isStructured
                ? AIResponseFormatter.formatStructuredContent(parsedResponse.data)
                : AIResponseFormatter.format(parsedResponse.data);
        }

        const headerHTML = header && header.trim()
            ? `<div class="summary-header">${this.escapeHtml(header.trim())}</div>`
            : "";
        const sourcesHTML = this.renderSources(sources);
        const answerHTML = forceTextOnly || !formattedContent.includes("structured-summary")
            ? `<div class="answer-content">${formattedContent}</div>`
            : formattedContent;

        this.setContent(id, `
            <div class="container">
                ${headerHTML}
                ${answerHTML}
                ${sourcesHTML}
            </div>
        `);
        this.showElement(id);
    }

    static formatSourceLabel(source) {
        if (source.title && source.title !== source.url) {
            return this.escapeHtml(source.title);
        }

        try {
            return this.escapeHtml(new URL(source.url).hostname.replace(/^www\./i, ""));
        } catch (error) {
            return this.escapeHtml(source.url || "Source");
        }
    }

    static renderSources(sources = []) {
        const normalizedSources = (sources || [])
            .filter(source => source?.url)
            .slice(0, 6);

        if (!normalizedSources.length) {
            return "";
        }

        const items = normalizedSources.map(source => {
            let domainLabel = source.url;

            try {
                domainLabel = new URL(source.url).hostname.replace(/^www\./i, "");
            } catch (error) {
                domainLabel = source.url;
            }

            return `
                <a class="source-link" href="${this.escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
                    <span class="source-title">${this.formatSourceLabel(source)}</span>
                    <span class="source-domain">${this.escapeHtml(domainLabel)}</span>
                </a>
            `;
        }).join("");

        return `
            <div class="sources-section">
                <div class="sources-title">Sources</div>
                <div class="sources-list">${items}</div>
            </div>
        `;
    }

    static escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}

class AIResponseFormatter {
    static format(text) {
        if (!text) {
            return "";
        }

        return text
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .replace(/`(.*?)`/g, "<code>$1</code>")
            .replace(/\n\n/g, "<br><br>")
            .replace(/\n/g, "<br>")
            .trim();
    }

    static parseStructuredResponse(response) {
        const cleanedResponse = (response || "")
            .trim()
            .replace(/^(```json\s*|```\s*)/i, "")
            .replace(/(```\s*)$/i, "");

        try {
            const parsed = JSON.parse(cleanedResponse);

            if (parsed.summary && Array.isArray(parsed.topics)) {
                return {
                    isStructured: true,
                    data: parsed
                };
            }

            if (parsed.summary) {
                return {
                    isStructured: true,
                    data: {
                        summary: parsed.summary,
                        topics: parsed.topics || []
                    }
                };
            }
        } catch (error) {
            Logger.log("Response was not JSON. Falling back to plain-text parsing.");
        }

        const fallback = this.createFallbackStructure(response);
        if (fallback) {
            return {
                isStructured: true,
                data: fallback
            };
        }

        return {
            isStructured: false,
            data: response
        };
    }

    static createFallbackStructure(text) {
        const lines = (text || "")
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

        if (lines.length < 2) {
            return null;
        }

        const summary = lines[0];
        const topics = [];
        let currentTopic = null;

        for (let index = 1; index < lines.length; index += 1) {
            const line = lines[index];

            if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line) || /^#{1,6}\s+/.test(line)) {
                if (currentTopic) {
                    topics.push(currentTopic);
                }

                currentTopic = {
                    heading: line.replace(/^[-*•\d.#\s]+/, "").trim(),
                    description: ""
                };
                continue;
            }

            if (currentTopic) {
                currentTopic.description += `${currentTopic.description ? " " : ""}${line}`;
            }
        }

        if (currentTopic) {
            topics.push(currentTopic);
        }

        if (!topics.length) {
            return null;
        }

        return { summary, topics };
    }

    static formatStructuredContent(data) {
        let html = `<div class="structured-summary">`;
        html += `
            <div class="main-summary">
                ${this.format(data.summary)}
            </div>
        `;

        if (data.topics && data.topics.length > 0) {
            html += `<div class="topics-container">`;

            data.topics.forEach((topic, index) => {
                const heading = topic.heading || `Topic ${index + 1}`;
                const description = topic.description || "No description available.";

                html += `
                    <div class="topic-item" data-topic-index="${index}">
                        <div class="topic-header">
                            <h4 class="topic-heading">${this.format(heading)}</h4>
                        </div>
                        <div class="topic-description">${this.format(description)}</div>
                    </div>
                `;
            });

            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }
}

class TabHelper {
    static async getCurrentTab() {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tabs.length) {
            throw new Error("No active tab found.");
        }
        return tabs[0];
    }

    static async getSelectedText(tab) {
        try {
            const response = await browser.tabs.sendMessage(tab.id, { type: "get_selected_text" });
            if (response?.success && response.selectedText) {
                return response.selectedText;
            }
        } catch (error) {
            Logger.log("Content-script selection lookup failed.", error);
        }

        try {
            const result = await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: TextSelectionHelper.getSelectedText
            });

            return result?.[0]?.result || null;
        } catch (error) {
            Logger.error("Script-injection selection lookup failed.", error);
            return null;
        }
    }
}

class APIService {
    static async sendMessage(type, payload = {}) {
        const response = await browser.runtime.sendMessage({ type, ...payload });

        if (!response) {
            throw new Error("No response received from the TL;Pinch background script.");
        }

        if (!response.success) {
            const error = new Error(response.error || "Apple Intelligence request failed.");
            if (response.errorDetails) {
                error.details = response.errorDetails;
            }
            throw error;
        }

        return response;
    }

    static async explainText(tabId, selectedText, url, title) {
        return this.sendMessage(MESSAGE_TYPES.explainSelectedText, {
            tabId,
            selectedText,
            url,
            title
        });
    }

    static async summarizePage(tabId, url, title) {
        return this.sendMessage(MESSAGE_TYPES.summarizePage, {
            tabId,
            url,
            title
        });
    }
}

class ButtonManager {
    static showFooter() {
        UIHelper.showElement(ELEMENTS.footer);
    }

    static hideFooter() {
        UIHelper.hideElement(ELEMENTS.footer);
    }
}

class AppController {
    static async initialize() {
        try {
            window.scrollTo(0, 0);
            await this.handleSummarization();
        } catch (error) {
            Logger.error("Failed to initialize TL;Pinch.", error);
            UIHelper.showError(
                ELEMENTS.summaryResult,
                error.message || "Failed to initialize TL;Pinch.",
                error.details || {
                    title: "TL;Pinch Failed to Start",
                    message: "The extension could not initialize correctly.",
                    action: "Try reopening the popup or refreshing the page.",
                    fullError: error.message || String(error)
                }
            );
            ButtonManager.showFooter();
        }

        this.setupEventListeners();
    }

    static setupEventListeners() {
        UIHelper.getElement(ELEMENTS.footerRefreshButton).addEventListener("click", () => {
            this.refresh();
        });
    }

    static async handleSummarization() {
        const tab = await TabHelper.getCurrentTab();
        await new Promise(resolve => setTimeout(resolve, 100));

        const selectedText = await TabHelper.getSelectedText(tab);
        if (selectedText) {
            await this.explainSelectedText(tab, selectedText);
            return;
        }

        await this.summarizeFullPage(tab);
    }

    static async explainSelectedText(tab, selectedText) {
        try {
            UIHelper.showLoading(ELEMENTS.summaryResult, "explaining");
            ButtonManager.hideFooter();

            const response = await APIService.explainText(tab.id, selectedText, tab.url, tab.title);
            UIHelper.showSuccess(
                ELEMENTS.summaryResult,
                response.explanation,
                false,
                selectedText,
                response.sources || []
            );
        } catch (error) {
            Logger.error("Failed to explain selected text.", error);
            UIHelper.showError(
                ELEMENTS.summaryResult,
                error.message || "Failed to explain the selected text.",
                error.details || null
            );
        } finally {
            ButtonManager.showFooter();
        }
    }

    static async summarizeFullPage(tab) {
        try {
            UIHelper.showLoading(ELEMENTS.summaryResult, "summarizing");
            ButtonManager.hideFooter();

            const response = await APIService.summarizePage(tab.id, tab.url, tab.title);
            UIHelper.showSuccess(
                ELEMENTS.summaryResult,
                response.summary,
                false,
                tab.title,
                response.sources || []
            );
        } catch (error) {
            Logger.error("Failed to summarize page.", error);
            UIHelper.showError(
                ELEMENTS.summaryResult,
                error.message || "Failed to summarize this page.",
                error.details || null
            );
        } finally {
            ButtonManager.showFooter();
        }
    }

    static refresh() {
        window.scrollTo({ top: 0, behavior: "smooth" });
        UIHelper.setContent(ELEMENTS.summaryResult, "");
        ButtonManager.hideFooter();
        this.handleSummarization();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    AppController.initialize();
});
