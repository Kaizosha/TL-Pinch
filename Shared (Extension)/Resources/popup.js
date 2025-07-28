// Constants
const ELEMENTS = {
    summaryResult: 'summaryResult',
    // Footer elements
    footer: 'footer',
    currentAiProvider: 'currentAiProvider',
    footerSettingsButton: 'footerSettingsButton',
    footerRefreshButton: 'footerRefreshButton',
    // Settings elements
    settingsSection: 'settingsSection',
    mainContent: 'mainContent',
    providerSelect: 'providerSelect',
    claudeApiKey: 'claudeApiKey',
    openaiApiKey: 'openaiApiKey',
    geminiApiKey: 'geminiApiKey',
    // Model selection elements
    claudeModel: 'claudeModel',
    openaiModel: 'openaiModel', 
    geminiModel: 'geminiModel',
    // Advanced settings elements
    toggleAdvanced: 'toggleAdvanced',
    advancedOptions: 'advancedOptions',
    summaryPrompt: 'summaryPrompt',
    explanationPrompt: 'explanationPrompt',
    resetToDefaults: 'resetToDefaults',
    saveSettings: 'saveSettings',
    testConnection: 'testConnection',
    settingsStatus: 'settingsStatus'
};

const CSS_CLASSES = {
    container: 'container',
    loading: 'loading',
    error: 'error',
    buttonGroup: 'button-group',
    left: 'left',
    right: 'right',
    settingsOpen: 'settings-open'
};

const MESSAGE_TYPES = {
    explainSelectedText: 'explain_selected_text',
    summarizePage: 'summarize_page',
    setAiProvider: 'set_ai_provider',
    getAiProviders: 'get_ai_providers',
    updateApiKey: 'update_api_key'
};

// Centralized provider configuration
const PROVIDER_CONFIG = {
    claude: { name: 'Claude', displayName: 'Claude (Anthropic)' },
    openai: { name: 'GPT', displayName: 'OpenAI GPT' },
    gemini: { name: 'Gemini', displayName: 'Google Gemini' }
};

// Centralized logging
const Logger = {
    enabled: true, // Set to false for production
    log: function(message, ...args) {
        if (this.enabled) console.log(message, ...args);
    },
    error: function(message, ...args) {
        console.error(message, ...args);
    }
};

// Global content cache
let pageContentCache = null;

// Default settings object
const DEFAULT_SETTINGS = {
    provider: 'claude',
    apiKeys: {
        claude: '',
        openai: '',
        gemini: ''
    },
    models: {
        claude: 'claude-3-5-sonnet-20241022',
        openai: 'gpt-4.1',
        gemini: 'gemini-2.0-flash'
    },
    customPrompts: {
        summary: '',
        explanation: ''
    }
};

// Current settings (initialized from defaults)
let currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

// Function to update AI provider display
function updateAIProviderDisplay() {
    const providerElement = UIHelper.getElement(ELEMENTS.currentAiProvider);
    if (providerElement) {
        providerElement.textContent = PROVIDER_CONFIG[currentSettings.provider]?.name || 'AI';
    }
}

// Function to update settings button text based on current view
function updateSettingsButtonText(showingSettings = false) {
    const settingsBtn = UIHelper.getElement(ELEMENTS.footerSettingsButton);
    if (settingsBtn) {
        settingsBtn.textContent = showingSettings ? 'SUMMARY' : 'SETTINGS';
    }
}

// Shared Text Selection Utility
class TextSelectionHelper {
    static getSelectedText() {
        // Method 1: Standard selection
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
            return selection.toString().trim();
        }
        
        // Method 2: Check for input/textarea selection
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            const start = activeElement.selectionStart;
            const end = activeElement.selectionEnd;
            if (start !== end) {
                const selectedText = activeElement.value.substring(start, end).trim();
                if (selectedText) return selectedText;
            }
        }
        
        // Method 3: Check for any ranges in selection
        if (selection && selection.rangeCount > 0) {
            for (let i = 0; i < selection.rangeCount; i++) {
                const range = selection.getRangeAt(i);
                const text = range.toString().trim();
                if (text) return text;
            }
        }
        
        return null;
    }
}

// Utility Functions
class UIHelper {
    static getElement(id) {
        return document.getElementById(id);
    }

    static createElement(tag, className = '', content = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (content) element.innerHTML = content;
        return element;
    }

    static showElement(id) {
        const element = this.getElement(id);
        if (element) element.style.display = 'block';
    }

    static hideElement(id) {
        const element = this.getElement(id);
        if (element) element.style.display = 'none';
    }

    static setContent(id, content) {
        const element = this.getElement(id);
        if (element) element.innerHTML = content;
    }

    static showLoading(id, type = 'summarizing') {
        const providerName = PROVIDER_CONFIG[currentSettings.provider]?.name || 'AI';
        
        const loadingText = type === 'explaining' 
            ? `${providerName} is explaining`
            : `${providerName} is summarizing`;
        
        // Scroll to top when loading starts
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        this.setContent(id, `
            <div class="loading loading-centered">
                <span class="loading-text">${loadingText}</span>
            </div>
        `);
        this.showElement(id);
    }

    static showError(id, message, errorDetails = null) {
        let errorHTML;
        
        if (errorDetails && typeof errorDetails === 'object') {
            // Enhanced error display with structured information
            errorHTML = `
                <div class="error-container">
                    <div class="error-title">${this.escapeHtml(errorDetails.title || 'Error')}</div>
                    <div class="error-message">${this.escapeHtml(errorDetails.message || message)}</div>
                    ${errorDetails.action ? `<div class="error-action">${this.escapeHtml(errorDetails.action)}</div>` : ''}
                    <details class="error-details">
                        <summary>Technical Details</summary>
                        <div class="error-full">${this.escapeHtml(errorDetails.fullError || message)}</div>
                    </details>
                </div>
            `;
        } else {
            // Fallback to simple error display
            errorHTML = `<div class="${CSS_CLASSES.error}">Error: ${this.escapeHtml(message)}</div>`;
        }
        
        this.setContent(id, errorHTML);
        this.showElement(id);
    }

    static showSuccess(id, content, forceTextOnly = false, header = null) {
        let formattedContent;
        
        if (forceTextOnly) {
            // Skip structured parsing for simple text responses
            formattedContent = AIResponseFormatter.format(content);
        } else {
            const parsedResponse = AIResponseFormatter.parseStructuredResponse(content);
            
            if (parsedResponse.isStructured) {
                formattedContent = AIResponseFormatter.formatStructuredContent(parsedResponse.data);
            } else {
                formattedContent = AIResponseFormatter.format(parsedResponse.data);
            }
        }
        
        const headerHtml = header && header.trim() 
            ? `<div class="summary-header">${this.escapeHtml(header.trim())}</div>` 
            : '';
        
        this.setContent(id, `
            <div class="${CSS_CLASSES.container}">
                ${headerHtml}
                ${forceTextOnly || !formattedContent.includes('structured-summary') ? `<div class="answer-content">${formattedContent}</div>` : formattedContent}
            </div>
        `);
        this.showElement(id);
    }
    
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

class AIResponseFormatter {
    static format(text) {
        if (!text) return '';
        
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>')
            .trim();
    }

    static parseStructuredResponse(response) {
        // Clean up common AI response artifacts that might interfere with JSON parsing
        let cleanedResponse = response.trim();
        
        // Remove common prefixes that AIs sometimes add
        cleanedResponse = cleanedResponse.replace(/^(```json\s*|```\s*)/i, '');
        cleanedResponse = cleanedResponse.replace(/(```\s*)$/i, '');
        
        try {
            // Try to parse as JSON first
            const parsed = JSON.parse(cleanedResponse);
            
            // Validate the expected structure
            if (parsed.summary && parsed.topics && Array.isArray(parsed.topics)) {
                Logger.log('Successfully parsed structured response with', parsed.topics.length, 'topics');
                return {
                    isStructured: true,
                    data: parsed
                };
            } else if (parsed.summary) {
                // Partial structure - has summary but no topics
                Logger.log('Partial JSON structure detected, using available data');
                return {
                    isStructured: true,
                    data: {
                        summary: parsed.summary,
                        topics: parsed.topics || []
                    }
                };
            }
        } catch (error) {
            Logger.log('Response is not valid JSON, treating as plain text');
        }
        
        // Fallback: Try to create structure from plain text
        const fallbackStructure = this.createFallbackStructure(response);
        if (fallbackStructure) {
            Logger.log('Created fallback structure from plain text');
            return {
                isStructured: true,
                data: fallbackStructure
            };
        }
        
        // Final fallback to plain text
        return {
            isStructured: false,
            data: response
        };
    }

    static createFallbackStructure(text) {
        // Try to extract a basic structure from plain text
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            return null; // Not enough content to structure
        }
        
        // Use first paragraph as summary
        const summary = lines[0].trim();
        
        // Look for bullet points or numbered items as topics
        const topics = [];
        let currentTopic = null;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Check if line looks like a bullet point or header
            if (line.match(/^[-•*]\s+/) || line.match(/^\d+\.\s+/) || line.match(/^#{1,6}\s+/)) {
                if (currentTopic) {
                    topics.push(currentTopic);
                }
                currentTopic = {
                    heading: line.replace(/^[-•*\d\.#\s]+/, '').trim(),
                    description: ''
                };
            } else if (currentTopic && line.length > 0) {
                // Add to current topic description
                currentTopic.description += (currentTopic.description ? ' ' : '') + line;
            }
        }
        
        if (currentTopic) {
            topics.push(currentTopic);
        }
        
        // Only return structure if we found some topics
        if (topics.length > 0) {
            return { summary, topics };
        }
        
        return null;
    }

    static formatStructuredContent(data) {
        let html = `<div class="structured-summary">`;
        
        // Add the main summary without label
        html += `<div class="main-summary">
            ${this.format(data.summary)}
        </div>`;
        
        // Add topics if they exist
        if (data.topics && data.topics.length > 0) {
            html += `<div class="topics-container">`;
            
            data.topics.forEach((topic, index) => {
                const heading = topic.heading || `Topic ${index + 1}`;
                const description = topic.description || 'No description available';
                
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
        if (tabs.length === 0) {
            throw new Error("No active tab found");
        }
        return tabs[0];
    }

    static async getSelectedText(tab) {
        Logger.log('Getting selected text for tab:', tab.id);
        
        try {
            // First try: Content script method
            const response = await browser.tabs.sendMessage(tab.id, { type: 'get_selected_text' });
            if (response && response.success && response.selectedText) {
                Logger.log('Content script method successful, length:', response.selectedText.length);
                return response.selectedText;
            }
        } catch (error) {
            Logger.error("Content script method failed:", error);
        }
        
        // Second try: Direct script injection method
        try {
            const result = await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: TextSelectionHelper.getSelectedText
            });
            
            if (result && result[0] && result[0].result) {
                Logger.log('Direct injection method successful, length:', result[0].result.length);
                return result[0].result;
            }
        } catch (error) {
            Logger.error("Direct injection method failed:", error);
        }
        
        // Third try: Fallback injection with expanded logic
        try {
            const result = await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Try multiple selection methods
                    let selectedText = null;
                    
                    // Method 1: Standard selection
                    const selection = window.getSelection();
                    if (selection && selection.toString().trim()) {
                        selectedText = selection.toString().trim();
                    }
                    
                    // Method 2: Check for any text selection
                    if (!selectedText) {
                        const activeElement = document.activeElement;
                        if (activeElement && activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                            const start = activeElement.selectionStart;
                            const end = activeElement.selectionEnd;
                            if (start !== end) {
                                selectedText = activeElement.value.substring(start, end);
                            }
                        }
                    }
                    
                    // Method 3: Check for any highlighted text
                    if (!selectedText) {
                        const ranges = selection ? selection.rangeCount : 0;
                        for (let i = 0; i < ranges; i++) {
                            const range = selection.getRangeAt(i);
                            const text = range.toString().trim();
                            if (text) {
                                selectedText = text;
                                break;
                            }
                        }
                    }
                    
                    return selectedText;
                }
            });
            
            if (result && result[0] && result[0].result) {
                Logger.log('Fallback method successful, length:', result[0].result.length);
                return result[0].result;
            }
        } catch (error) {
            Logger.error("Fallback method failed:", error);
        }
        
        return null;
    }

    static async extractPageContent(tab) {
        try {
            // Check if this is a restricted page where content scripts can't run
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://') || tab.url.startsWith('edge://')) {
                throw new Error('Content scripts cannot run on this page type');
            }

            const response = await browser.tabs.sendMessage(tab.id, { type: 'extract_content' });
            if (response && response.success) {
                console.log('Content extracted via content script:', {
                    textLength: response.content.text.length,
                    wordCount: response.content.wordCount,
                    title: response.content.title
                });
                return response.content;
            }
            throw new Error('Content script returned invalid response');
        } catch (error) {
            console.error("Error extracting content from content script:", error);
            
            // Check if this is a restricted page
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://') || tab.url.startsWith('edge://')) {
                throw new Error('Cannot extract content from browser internal pages');
            }
            
            // Fallback to old injection method if content script fails
            try {
                console.log('Falling back to script injection method');
        const pageContent = await browser.scripting.executeScript({
            target: { tabId: tab.id },
                    func: () => {
                        // Simple inline content extraction for fallback
                        const content = {
                            title: document.title,
                            url: window.location.href,
                            text: ""
                        };
                        
                        const selectors = ['main', 'article', '.content', '.main-content', '#content', '#main', 'body'];
                        let mainContent = null;
                        
                        for (const selector of selectors) {
                            const element = document.querySelector(selector);
                            if (element) {
                                mainContent = element;
                                break;
                            }
                        }
                        
                        if (mainContent) {
                            content.text = mainContent.innerText || mainContent.textContent || "";
                            content.text = content.text.replace(/\s+/g, ' ').trim();
                            
                            if (content.text.length > 9000) {
                                content.text = content.text.substring(0, 9000) + "...";
                            }
                        }
                        
                        return content;
                    }
        });

        if (!pageContent || !pageContent[0] || !pageContent[0].result) {
                    throw new Error("Failed to extract page content via fallback method");
        }

        return pageContent[0].result;
            } catch (fallbackError) {
                console.error("Fallback method also failed:", fallbackError);
                throw new Error("Failed to extract page content: Both content script and fallback methods failed");
            }
        }
    }

    static async getPageInfo(tab) {
        try {
            const response = await browser.tabs.sendMessage(tab.id, { type: 'get_page_info' });
            if (response && response.success) {
                return response.pageInfo;
            }
            throw new Error('Content script returned invalid response for page info');
        } catch (error) {
            console.error("Error getting page info from content script:", error);
            // Fallback to basic info
            return {
                title: tab.title,
                url: tab.url,
                domain: new URL(tab.url).hostname,
                hasSelectedText: false,
                readyState: 'unknown',
                timestamp: new Date().toISOString()
            };
        }
    }
}

class SettingsManager {
    static async loadSettings() {
        try {
            const result = await browser.storage.local.get([
                'defaultProvider',
                'claudeApiKey', 
                'openaiApiKey', 
                'geminiApiKey',
                'claudeModel',
                'openaiModel',
                'geminiModel',
                'customSummaryPrompt',
                'customExplanationPrompt'
            ]);
            
            // Load basic settings
            currentSettings.provider = result.defaultProvider || DEFAULT_SETTINGS.provider;
            currentSettings.apiKeys.claude = result.claudeApiKey || '';
            currentSettings.apiKeys.openai = result.openaiApiKey || '';
            currentSettings.apiKeys.gemini = result.geminiApiKey || '';
            
            // Load model preferences
            currentSettings.models.claude = result.claudeModel || DEFAULT_SETTINGS.models.claude;
            currentSettings.models.openai = result.openaiModel || DEFAULT_SETTINGS.models.openai;
            currentSettings.models.gemini = result.geminiModel || DEFAULT_SETTINGS.models.gemini;
            
            // Load custom prompts
            currentSettings.customPrompts.summary = result.customSummaryPrompt || '';
            currentSettings.customPrompts.explanation = result.customExplanationPrompt || '';
            
            return currentSettings;
        } catch (error) {
            console.error('Error loading settings:', error);
            return currentSettings;
        }
    }

    static async saveSettings(settings) {
        try {
            await browser.storage.local.set({
                defaultProvider: settings.provider,
                claudeApiKey: settings.apiKeys.claude,
                openaiApiKey: settings.apiKeys.openai,
                geminiApiKey: settings.apiKeys.gemini,
                claudeModel: settings.models.claude,
                openaiModel: settings.models.openai,
                geminiModel: settings.models.gemini,
                customSummaryPrompt: settings.customPrompts.summary,
                customExplanationPrompt: settings.customPrompts.explanation
            });
            
            // Update background script with provider and models
            await browser.runtime.sendMessage({
                type: MESSAGE_TYPES.setAiProvider,
                provider: settings.provider
            });
            
            // Send custom settings to background script
            await browser.runtime.sendMessage({
                type: 'update_custom_settings',
                models: settings.models,
                customPrompts: settings.customPrompts
            });
            
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    static async resetToDefaults() {
        try {
            // Clear all stored settings
            await browser.storage.local.clear();
            
            // Reset current settings to defaults
            currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            
            return true;
        } catch (error) {
            console.error('Error resetting to defaults:', error);
            return false;
        }
    }

    static validateApiKey(provider, apiKey) {
        if (!apiKey) return false;
        
        switch (provider) {
            case 'claude':
                return apiKey.startsWith('sk-ant-');
            case 'openai':
                return apiKey.startsWith('sk-');
            case 'gemini':
                return apiKey.length > 30; // Basic length check
            default:
                return false;
        }
    }

    static async testConnection(provider) {
        const apiKey = currentSettings.apiKeys[provider];
        if (!apiKey) {
            const error = new Error('API key not configured');
            error.details = {
                title: 'API Key Missing',
                message: `No API key configured for ${PROVIDER_CONFIG[provider]?.displayName || provider}.`,
                action: 'Please enter your API key in the field above and save your settings.',
                fullError: 'API key not configured'
            };
            throw error;
        }

        // Send test message to background script
        try {
            await browser.runtime.sendMessage({
                type: MESSAGE_TYPES.updateApiKey,
                provider: provider,
                apiKey: apiKey
            });

            // Test with a simple request
            const testResponse = await APIService.testProvider(provider);
            return testResponse.success;
        } catch (error) {
            console.error('Connection test error details:', error);
            
            // Create enhanced error for connection test
            const enhancedError = new Error(error.message || 'Connection test failed');
            enhancedError.details = {
                title: 'Connection Test Failed',
                message: error.message || 'Unable to connect to the AI service.',
                action: 'Check your API key and internet connection. Make sure your account has sufficient credits.',
                fullError: error.message || error.toString()
            };
            
            throw enhancedError;
        }
    }

    static showSettingsStatus(message, type = 'info') {
        const statusElement = UIHelper.getElement(ELEMENTS.settingsStatus);
        statusElement.textContent = message;
        statusElement.className = `settings-status ${type}`;
        statusElement.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 3000);
    }
}

class SettingsUI {
    static async initialize() {
        await this.loadSettingsUI();
        this.setupEventListeners();
    }

    static async loadSettingsUI() {
        const settings = await SettingsManager.loadSettings();
        
        // Update provider selector
        UIHelper.getElement(ELEMENTS.providerSelect).value = settings.provider;
        
        // Update API key fields
        UIHelper.getElement(ELEMENTS.claudeApiKey).value = settings.apiKeys.claude;
        UIHelper.getElement(ELEMENTS.openaiApiKey).value = settings.apiKeys.openai;
        UIHelper.getElement(ELEMENTS.geminiApiKey).value = settings.apiKeys.gemini;
        
        // Update model selectors
        UIHelper.getElement(ELEMENTS.claudeModel).value = settings.models.claude;
        UIHelper.getElement(ELEMENTS.openaiModel).value = settings.models.openai;
        UIHelper.getElement(ELEMENTS.geminiModel).value = settings.models.gemini;

        // Update custom prompts
        UIHelper.getElement(ELEMENTS.summaryPrompt).value = settings.customPrompts.summary;
        UIHelper.getElement(ELEMENTS.explanationPrompt).value = settings.customPrompts.explanation;
        
        // Show only the selected provider's API key section
        this.showProviderSection(settings.provider);
        
        // Update AI provider display in footer
        updateAIProviderDisplay();
    }

    static showProviderSection(provider) {
        // Hide all API key sections
        document.querySelectorAll('.api-key-section').forEach(section => {
            section.style.display = 'none';
        });
        
        // Show only the selected provider's section
        const targetSection = document.querySelector(`[data-provider="${provider}"]`);
        if (targetSection) {
            targetSection.style.display = 'block';
        }
    }

    static setupEventListeners() {
        // Provider selection
        UIHelper.getElement(ELEMENTS.providerSelect).addEventListener('change', (e) => {
            currentSettings.provider = e.target.value;
            this.showProviderSection(e.target.value);
            updateAIProviderDisplay(); // Update footer display when provider changes
        });

        // API key input handlers
        ['claude', 'openai', 'gemini'].forEach(provider => {
            const input = UIHelper.getElement(`${provider}ApiKey`);
            input.addEventListener('input', (e) => {
                currentSettings.apiKeys[provider] = e.target.value;
                this.validateApiKeyInput(provider, e.target.value);
            });
        });

        // Model selection handlers
        UIHelper.getElement(ELEMENTS.claudeModel).addEventListener('change', (e) => {
            currentSettings.models.claude = e.target.value;
        });
        UIHelper.getElement(ELEMENTS.openaiModel).addEventListener('change', (e) => {
            currentSettings.models.openai = e.target.value;
        });
        UIHelper.getElement(ELEMENTS.geminiModel).addEventListener('change', (e) => {
            currentSettings.models.gemini = e.target.value;
        });

        // Custom prompt input handlers
        UIHelper.getElement(ELEMENTS.summaryPrompt).addEventListener('input', (e) => {
            currentSettings.customPrompts.summary = e.target.value;
        });
        UIHelper.getElement(ELEMENTS.explanationPrompt).addEventListener('input', (e) => {
            currentSettings.customPrompts.explanation = e.target.value;
        });

        // Password visibility toggles
        document.querySelectorAll('.toggle-visibility').forEach(button => {
            button.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const input = UIHelper.getElement(targetId);
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                e.target.textContent = isPassword ? 'Hide' : 'Show';
            });
        });

        // Settings actions
        UIHelper.getElement(ELEMENTS.saveSettings).addEventListener('click', () => {
            this.saveSettings();
        });

        UIHelper.getElement(ELEMENTS.testConnection).addEventListener('click', () => {
            this.testConnection();
        });

        UIHelper.getElement(ELEMENTS.resetToDefaults).addEventListener('click', () => {
            this.resetToDefaults();
        });

        // Advanced settings toggle
        UIHelper.getElement(ELEMENTS.toggleAdvanced).addEventListener('click', () => {
            this.toggleAdvancedSettings();
        });
    }

    static toggleSettings() {
        const settingsSection = UIHelper.getElement(ELEMENTS.settingsSection);
        
        if (settingsSection && (settingsSection.style.display === 'none' || settingsSection.style.display === '')) {
            this.showSettings();
        } else {
            this.hideSettings();
        }
    }

    static showSettings() {
        UIHelper.hideElement(ELEMENTS.summaryResult);
        UIHelper.showElement(ELEMENTS.settingsSection);
        
        // Update settings button text to show "SUMMARY"
        updateSettingsButtonText(true);
        
        // Hide refresh button completely when in settings
        UIHelper.hideElement(ELEMENTS.footerRefreshButton);
        
        // Scroll to top when showing settings
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Ensure the correct provider section is showing
        this.showProviderSection(currentSettings.provider);
    }

    static hideSettings() {
        UIHelper.hideElement(ELEMENTS.settingsSection);
        UIHelper.showElement(ELEMENTS.summaryResult);
        
        // Update settings button text to show "SETTINGS"
        updateSettingsButtonText(false);
        
        // Show refresh button when leaving settings
        UIHelper.showElement(ELEMENTS.footerRefreshButton);
        
        // Scroll to top when returning to summary
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    static validateApiKeyInput(provider, apiKey) {
        const input = UIHelper.getElement(`${provider}ApiKey`);
        const isValid = SettingsManager.validateApiKey(provider, apiKey);
        
        if (apiKey && !isValid) {
            input.style.borderColor = 'var(--error-primary)';
        } else {
            input.style.borderColor = 'var(--border-primary)';
        }
    }

    static async saveSettings() {
        try {
            const saveButton = UIHelper.getElement(ELEMENTS.saveSettings);
            saveButton.textContent = 'Saving...';
            saveButton.disabled = true;

            // Update API keys in background script
            for (const [provider, apiKey] of Object.entries(currentSettings.apiKeys)) {
                if (apiKey) {
                    await browser.runtime.sendMessage({
                        type: MESSAGE_TYPES.updateApiKey,
                        provider: provider,
                        apiKey: apiKey
                    });
                }
            }

            // Update custom settings in background script
            await browser.runtime.sendMessage({
                type: 'update_custom_settings',
                models: currentSettings.models,
                customPrompts: currentSettings.customPrompts
            });

            const success = await SettingsManager.saveSettings(currentSettings);
            
            if (success) {
                SettingsManager.showSettingsStatus('Settings saved successfully!', 'success');
            } else {
                SettingsManager.showSettingsStatus('Error saving settings', 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            SettingsManager.showSettingsStatus('Error saving settings', 'error');
        } finally {
            const saveButton = UIHelper.getElement(ELEMENTS.saveSettings);
            saveButton.textContent = 'Save Settings';
            saveButton.disabled = false;
        }
    }

    static async testConnection() {
        try {
            const testButton = UIHelper.getElement(ELEMENTS.testConnection);
            testButton.textContent = 'Testing...';
            testButton.disabled = true;

            // Use the currently selected provider from the dropdown
            const providerSelect = UIHelper.getElement(ELEMENTS.providerSelect);
            const currentProvider = providerSelect.value;
            const apiKey = currentSettings.apiKeys[currentProvider];
            
            if (!apiKey) {
                SettingsManager.showSettingsStatus(`Please configure an API key for ${PROVIDER_CONFIG[currentProvider]?.displayName || currentProvider}`, 'error');
                return;
            }

            if (!SettingsManager.validateApiKey(currentProvider, apiKey)) {
                SettingsManager.showSettingsStatus(`Invalid API key format for ${PROVIDER_CONFIG[currentProvider]?.displayName || currentProvider}`, 'error');
                return;
            }

            const success = await SettingsManager.testConnection(currentProvider);
            
            if (success) {
                SettingsManager.showSettingsStatus(`SUCCESS: ${PROVIDER_CONFIG[currentProvider]?.displayName || currentProvider} connection successful!`, 'success');
            } else {
                SettingsManager.showSettingsStatus(`ERROR: ${PROVIDER_CONFIG[currentProvider]?.displayName || currentProvider} connection failed`, 'error');
            }
        } catch (error) {
            console.error('Connection test error:', error);
            
            // Handle enhanced error details if available
            if (error.details) {
                // Show detailed error in status
                SettingsManager.showSettingsStatus(`${error.details.title}: ${error.details.message}`, 'error');
            } else {
                SettingsManager.showSettingsStatus(`ERROR: ${error.message}`, 'error');
            }
        } finally {
            const testButton = UIHelper.getElement(ELEMENTS.testConnection);
            testButton.textContent = 'Test Connection';
            testButton.disabled = false;
        }
    }

    static async resetToDefaults() {
        try {
            const resetButton = UIHelper.getElement(ELEMENTS.resetToDefaults);
            resetButton.textContent = 'Resetting...';
            resetButton.disabled = true;

            const success = await SettingsManager.resetToDefaults();

            if (success) {
                SettingsManager.showSettingsStatus('Settings reset to defaults!', 'success');
                
                // Reload the UI with default values
                await this.loadSettingsUI();
            } else {
                SettingsManager.showSettingsStatus('Error resetting settings', 'error');
            }
        } catch (error) {
            console.error('Error resetting settings:', error);
            SettingsManager.showSettingsStatus('Error resetting settings', 'error');
        } finally {
            const resetButton = UIHelper.getElement(ELEMENTS.resetToDefaults);
            resetButton.textContent = 'Reset All to Defaults';
            resetButton.disabled = false;
        }
    }

    static toggleAdvancedSettings() {
        const advancedOptions = UIHelper.getElement(ELEMENTS.advancedOptions);
        const toggleButton = UIHelper.getElement(ELEMENTS.toggleAdvanced);
        
        if (advancedOptions.style.display === 'none') {
            advancedOptions.style.display = 'block';
            toggleButton.textContent = 'Hide Advanced';
        } else {
            advancedOptions.style.display = 'none';
            toggleButton.textContent = 'Show Advanced';
        }
    }
}

class APIService {
    static async sendMessage(type, payload) {
        try {
            Logger.log(`Sending message: ${type}`);
            
            const response = await browser.runtime.sendMessage({ type, ...payload });
            
            if (!response) {
                throw new Error('No response received from background script');
            }
            
            if (!response.success) {
                throw new Error(response.error || 'Unknown error from background script');
            }
            
            return response;
        } catch (error) {
            Logger.error(`Error sending message ${type}:`, error);
            throw error;
        }
    }

    static async explainText(selectedText, url, title, content) {
        return this.sendMessage(MESSAGE_TYPES.explainSelectedText, {
            selectedText,
            url,
            title,
            content,
            provider: currentSettings.provider
        });
    }

    static async summarizePage(content, url, title) {
        return this.sendMessage(MESSAGE_TYPES.summarizePage, {
            content,
            url,
            title,
            provider: currentSettings.provider
        });
    }

    static async testProvider(provider) {
        // Simple test request
        return this.sendMessage(MESSAGE_TYPES.explainSelectedText, {
            selectedText: 'test',
            url: 'test',
            title: 'test',
            content: 'test',
            provider: provider
        });
    }
}

class ButtonManager {
    // Simplified - only footer management needed
    
    // Show footer (contains all buttons)
    static showFooter() {
        UIHelper.showElement(ELEMENTS.footer);
    }
    
    // Hide footer (rarely used, but available)
    static hideFooter() {
        UIHelper.hideElement(ELEMENTS.footer);
    }
}

class AppController {
    static async initialize() {
        try {
            // Ensure popup starts at the top
            window.scrollTo({ top: 0, behavior: 'instant' });
            
            Logger.log('TL;Pinch Extension - Initializing');
            
            // Initialize settings first
            await SettingsUI.initialize();
            
            // Update AI provider display
            updateAIProviderDisplay();
            
            // Initialize settings button text (starts showing summary, so button says "SETTINGS")
            updateSettingsButtonText(false);
            
            // Then handle summarization automatically
            await this.handleSummarization();
        } catch (error) {
            Logger.error("Error in initialization:", error);
            
            // Create detailed error for initialization failure
            const errorDetails = {
                title: 'Extension Initialization Failed',
                message: 'The extension failed to start properly.',
                action: 'Try refreshing the page and opening the extension again. If the problem persists, check your browser\'s extension settings.',
                fullError: error.message || error.toString()
            };
            
            UIHelper.showError(ELEMENTS.summaryResult, error.message || 'Failed to initialize extension', errorDetails);
        }
        
        this.setupEventListeners();
    }

    static setupEventListeners() {
        // Footer Refresh button
        UIHelper.getElement(ELEMENTS.footerRefreshButton).addEventListener("click", () => {
            this.refresh();
        });

        // Footer Settings button - set up event listener
        const footerSettingsBtn = UIHelper.getElement(ELEMENTS.footerSettingsButton);
        if (footerSettingsBtn) {
            footerSettingsBtn.addEventListener("click", () => {
                SettingsUI.toggleSettings();
            });
        } else {
            Logger.error("Footer Settings button not found!");
        }
    }

    static async handleSummarization() {
        Logger.log('Starting summarization process');
        
        const tab = await TabHelper.getCurrentTab();
        
        // Add a small delay to ensure content script is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const content = await TabHelper.extractPageContent(tab);
        const selectedText = await TabHelper.getSelectedText(tab);
        
        if (selectedText) {
            Logger.log('Processing selected text explanation');
            await this.explainSelectedText(tab, selectedText, content);
        } else {
            Logger.log('Processing full page summarization');
            await this.summarizeFullPage(tab, content);
        }
    }

    static async explainSelectedText(tab, selectedText, content) {
        try {
            UIHelper.showLoading(ELEMENTS.summaryResult, 'explaining');
            ButtonManager.hideFooter();

            const response = await APIService.explainText(selectedText, tab.url, tab.title, content);
            
            if (response.success) {
                UIHelper.showSuccess(ELEMENTS.summaryResult, response.explanation, false, selectedText);
                ButtonManager.showFooter();
            } else {
                UIHelper.showError(ELEMENTS.summaryResult, response.error, response.errorDetails);
                ButtonManager.showFooter();
            }
        } catch (error) {
            console.error("Error explaining selected text:", error);
            UIHelper.showError(ELEMENTS.summaryResult, error.message || 'Failed to explain selected text');
            ButtonManager.showFooter();
        }
    }

    static async summarizeFullPage(tab, content) {
        try {
            UIHelper.showLoading(ELEMENTS.summaryResult);
            ButtonManager.hideFooter();

            const response = await APIService.summarizePage(content, tab.url, tab.title);
            
            if (response.success) {
                UIHelper.showSuccess(ELEMENTS.summaryResult, response.summary, false, tab.title);
                ButtonManager.showFooter();
            } else {
                UIHelper.showError(ELEMENTS.summaryResult, response.error, response.errorDetails);
                ButtonManager.showFooter();
            }
        } catch (error) {
            Logger.error("Error summarizing page:", error);
            UIHelper.showError(ELEMENTS.summaryResult, error.message || 'Failed to summarize page');
            ButtonManager.showFooter();
        }
    }

    static refresh() {
        // Scroll to top immediately when refresh is clicked
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Hide footer immediately during refresh
        ButtonManager.hideFooter();
        
        // Clear previous results
        UIHelper.setContent(ELEMENTS.summaryResult, '');
        
        // Restart the process
        this.handleSummarization();
    }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", function() {
    AppController.initialize();
});
