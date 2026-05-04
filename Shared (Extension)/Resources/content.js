/*
Content Script for TL;Pinch Extension
=====================================

FEATURES:
- Smart content extraction with priority selectors
- Advanced text cleaning and processing
- Selected text detection and handling
- Page metadata extraction for context
- Comprehensive error handling
*/

// Polyfill for browser API
if (typeof browser === "undefined") {
    var browser = chrome;
}

// Centralized logging for content script
const ContentLogger = {
    enabled: true,
    log: function(message, ...args) {
        if (this.enabled) console.log('[TL;Pinch Content]', message, ...args);
    },
    error: function(message, ...args) {
        console.error('[TL;Pinch Content]', message, ...args);
    }
};

const EXTRACTION_CHARACTER_LIMIT = 60_000;

class ContentExtractor {
    constructor() {
        ContentLogger.log("ContentExtractor initialized");
        this.setupMessageListener();
    }

    /**
     * Set up message listener for communication with popup
     */
    setupMessageListener() {
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'extract_content':
                    const content = this.extractPageContent();
                    sendResponse({ success: true, content });
                    break;
                    
                case 'get_selected_text':
                    const selectedText = this.getSelectedText();
                    sendResponse({ success: true, selectedText });
                    break;
                    
                case 'get_page_info':
                    const pageInfo = this.getPageInfo();
                    sendResponse({ success: true, pageInfo });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
            return true; // Indicates async response
        });
    }

    /**
     * Extract comprehensive page content
     */
    extractPageContent() {
        const content = {
            title: document.title,
            url: window.location.href,
            text: ""
        };

        // Priority selectors for finding main content
        const selectors = [
            'main',
            'article',
            '[role="main"]',
            '.content',
            '.main-content',
            '.post-content',
            '.entry-content',
            '.article-content',
            '#content',
            '#main',
            '.container',
            'body'
        ];

        let mainContent = null;
        
        // Find the best content container
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && this.isValidContentElement(element)) {
                mainContent = element;
                break;
            }
        }

        if (mainContent) {
            content.text = this.extractTextFromElement(mainContent);
            
            // Limit content size for performance
            if (content.text.length > EXTRACTION_CHARACTER_LIMIT) {
                content.text = content.text.substring(0, EXTRACTION_CHARACTER_LIMIT).trim() + "...";
            }
        }

        // Add metadata
        content.wordCount = content.text.split(/\s+/).length;
        content.extractedAt = new Date().toISOString();

        ContentLogger.log(`Content extracted: ${content.text.length} characters, ${content.wordCount} words`);
        return content;
    }

    /**
     * Check if an element is valid for content extraction
     */
    isValidContentElement(element) {
        // Skip if element is too small or hidden
        const rect = element.getBoundingClientRect();
        if (rect.height < 100 || rect.width < 200) return false;
        
        // Skip if element is hidden
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        
        // Check for meaningful text content
        const textContent = element.innerText || element.textContent || '';
        return textContent.trim().length > 100;
    }

    /**
     * Extract clean text from an element
     */
    extractTextFromElement(element) {
        // Clone element to avoid modifying the original
        const clone = element.cloneNode(true);
        
        // Remove unwanted elements
        const unwantedSelectors = [
            'script', 'style', 'nav', 'header', 'footer',
            '.advertisement', '.ads', '.sidebar', '.menu',
            '.navigation', '.breadcrumb', '.share', '.social',
            '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
        ];
        
        unwantedSelectors.forEach(selector => {
            const elements = clone.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        });
        
        // Get text content and clean it up
        let text = clone.innerText || clone.textContent || '';
        
        // Clean up text
        text = text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();                        // Trim edges
        
        return text;
    }

    /**
     * Get currently selected text
     */
    getSelectedText() {
        ContentLogger.log('Content script: getSelectedText called');
        
        // Method 1: Standard selection
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
            const selectedText = selection.toString().trim();
            ContentLogger.log(`Content script: Standard selection found, length: ${selectedText.length}`);
            return selectedText;
        }
        
        // Method 2: Check for input/textarea selection
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            const start = activeElement.selectionStart;
            const end = activeElement.selectionEnd;
            if (start !== end) {
                const selectedText = activeElement.value.substring(start, end).trim();
                if (selectedText) {
                    ContentLogger.log(`Content script: Input selection found, length: ${selectedText.length}`);
                    return selectedText;
                }
            }
        }
        
        // Method 3: Check for any ranges in selection
        if (selection && selection.rangeCount > 0) {
            for (let i = 0; i < selection.rangeCount; i++) {
                const range = selection.getRangeAt(i);
                const text = range.toString().trim();
                if (text) {
                    ContentLogger.log(`Content script: Range selection found, length: ${text.length}`);
                    return text;
                }
            }
        }
        
        // Method 4: Check for any highlighted elements
        const highlightedElements = document.querySelectorAll('::selection, ::-moz-selection');
        if (highlightedElements.length > 0) {
            for (const element of highlightedElements) {
                const text = element.textContent || element.innerText;
                if (text && text.trim()) {
                    ContentLogger.log(`Content script: Highlighted element found, length: ${text.trim().length}`);
                    return text.trim();
                }
            }
        }
        
        ContentLogger.log('Content script: No selected text found');
        return null;
    }

    /**
     * Get basic page information
     */
    getPageInfo() {
        return {
            title: document.title,
            url: window.location.href,
            domain: window.location.hostname,
            hasSelectedText: !!this.getSelectedText(),
            readyState: document.readyState,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get page metadata (for future use)
     */
    getPageMetadata() {
        const metadata = {};
        
        // Get meta description
        const description = document.querySelector('meta[name="description"]');
        if (description) {
            metadata.description = description.content;
        }
        
        // Get meta keywords
        const keywords = document.querySelector('meta[name="keywords"]');
        if (keywords) {
            metadata.keywords = keywords.content;
        }
        
        // Get Open Graph data
        const ogTitle = document.querySelector('meta[property="og:title"]');
        const ogDescription = document.querySelector('meta[property="og:description"]');
        const ogType = document.querySelector('meta[property="og:type"]');
        
        if (ogTitle) metadata.ogTitle = ogTitle.content;
        if (ogDescription) metadata.ogDescription = ogDescription.content;
        if (ogType) metadata.ogType = ogType.content;
        
        // Get language
        metadata.language = document.documentElement.lang || 'unknown';
        
        return metadata;
    }
}

// Initialize content extractor when the content script loads
ContentLogger.log('TL;Pinch Content Script: Initializing...');
ContentLogger.log('User Agent:', navigator.userAgent);
ContentLogger.log('Document ready state:', document.readyState);

// Wait for document to be ready if needed
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        ContentLogger.log('TL;Pinch Content Script: DOM Content Loaded');
        const contentExtractor = new ContentExtractor();
    });
} else {
    ContentLogger.log('TL;Pinch Content Script: Document already ready');
    const contentExtractor = new ContentExtractor();
}

// Export for potential use by other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentExtractor;
}
