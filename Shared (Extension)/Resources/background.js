/*
TL;Pinch Extension - Background Script
=====================================

ENHANCED ERROR HANDLING:
This extension now provides user-friendly error explanations for common issues:

• HTTP 429 (Rate Limit): "You've sent too many requests too quickly"
• HTTP 401 (Unauthorized): "Your API key is invalid"
• HTTP 500 (Server Error): "The AI service is experiencing issues"
• Content Too Long: Provider-specific guidance for token limits
• Network Errors: Connection and timeout handling
• API Key Issues: Clear validation and setup instructions

Error Format:
- Title: Brief, clear error name
- Message: User-friendly explanation
- Action: Specific steps to resolve the issue
- Technical Details: Collapsible section with full error info

This helps users understand what went wrong and how to fix it.
*/

// Centralized logging for background script
const BackgroundLogger = {
    enabled: true,
    log: function(message, ...args) {
        if (this.enabled) console.log('[TL;Pinch Background]', message, ...args);
    },
    error: function(message, ...args) {
        console.error('[TL;Pinch Background]', message, ...args);
    }
};

// AI Provider Configuration
const AI_CONFIG = {
    // Default provider (can be changed dynamically)
    DEFAULT_PROVIDER: 'claude', // 'claude', 'openai', 'gemini'
    
    // API configurations for each provider
    PROVIDERS: {
        claude: {
            baseURL: 'https://api.anthropic.com/v1/',
            apiKey: '', // Set your Anthropic API key here
            model: 'claude-3-5-sonnet-20241022',
            maxTokens: 4000
        },
        openai: {
            baseURL: 'https://api.openai.com/v1/',
            apiKey: '', // Set your OpenAI API key here
            model: 'gpt-4.1',
            maxTokens: 4000,
            useResponsesAPI: true // Flag to use new OpenAI Responses API instead of Chat Completions
            // Responses API uses /v1/responses endpoint and different request format
            // Input format: { model, input, max_tokens, temperature } instead of { model, messages, ... }
        },
        gemini: {
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
            apiKey: '', // Set your Gemini API key here
            model: 'gemini-2.0-flash',
            maxTokens: 4000
        }
    },
    
    TIMEOUT: 30000
};

// Enhanced Error Handler
class APIErrorHandler {
    static getErrorMessage(error, provider) {
        // Handle network/fetch errors
        if (error.name === 'AbortError') {
            return {
                title: 'Request Timeout',
                message: 'The request took too long to complete. Please try again.',
                action: 'Check your internet connection and try again.'
            };
        }
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return {
                title: 'Connection Error',
                message: 'Unable to connect to the AI service. Please check your internet connection.',
                action: 'Verify your internet connection and try again.'
            };
        }
        
        // Extract HTTP status from error message if available
        let httpStatus = null;
        const httpMatch = error.message?.match(/HTTP (\d+):/);
        if (httpMatch) {
            httpStatus = parseInt(httpMatch[1]);
        }
        
        // Handle specific HTTP status codes
        if (httpStatus) {
            return this.getHTTPErrorMessage(httpStatus, provider, error.message);
        }
        
        // Handle provider-specific error messages
        const providerError = this.getProviderSpecificError(error.message, provider);
        if (providerError) {
            return providerError;
        }
        
        // Handle API key errors
        if (error.message?.includes('API key') || error.message?.includes('unauthorized') || error.message?.includes('authentication')) {
            return {
                title: 'Authentication Error',
                message: `Invalid or missing API key for ${this.getProviderDisplayName(provider)}.`,
                action: 'Please check your API key in Settings and make sure it\'s valid.'
            };
        }
        
        // Handle quota/billing errors
        if (error.message?.includes('quota') || error.message?.includes('billing') || error.message?.includes('insufficient')) {
            return {
                title: 'Account Limit Reached',
                message: `Your ${this.getProviderDisplayName(provider)} account has reached its usage limit.`,
                action: 'Check your account billing and usage limits on the provider\'s dashboard.'
            };
        }
        
        // Default error
        return {
            title: 'AI Service Error',
            message: `An error occurred with ${this.getProviderDisplayName(provider)}: ${error.message || 'Unknown error'}`,
            action: 'Please try again in a moment. If the problem persists, check your API key and account status.'
        };
    }
    
    static getHTTPErrorMessage(status, provider, fullMessage) {
        const providerName = this.getProviderDisplayName(provider);
        
        switch (status) {
            case 400:
                return {
                    title: 'Invalid Request (400)',
                    message: `The request to ${providerName} was malformed or invalid.`,
                    action: 'This is usually a technical issue. Please try again with different content or contact support if it persists.'
                };
                
            case 401:
                return {
                    title: 'Unauthorized (401)',
                    message: `Your API key for ${providerName} is invalid or has been revoked.`,
                    action: 'Please check your API key in Settings. You may need to generate a new one from your provider dashboard.'
                };
                
            case 403:
                return {
                    title: 'Access Forbidden (403)',
                    message: `Your ${providerName} account doesn't have permission to access this service.`,
                    action: 'Check your account permissions and subscription status in your provider dashboard.'
                };
                
            case 404:
                return {
                    title: 'Service Not Found (404)',
                    message: `The requested ${providerName} service or model is not available.`,
                    action: 'The AI model may be temporarily unavailable. Try switching to a different model in Settings.'
                };
                
            case 429:
                return {
                    title: 'Rate Limit Exceeded (429)',
                    message: `You've sent too many requests to ${providerName} too quickly.`,
                    action: 'Please wait a few minutes before trying again. Consider upgrading your plan for higher rate limits.'
                };
                
            case 500:
                return {
                    title: 'Server Error (500)',
                    message: `${providerName} is experiencing internal server issues.`,
                    action: 'This is a temporary issue on their end. Please try again in a few minutes.'
                };
                
            case 502:
                return {
                    title: 'Service Unavailable (502)',
                    message: `${providerName} gateway is currently unavailable.`,
                    action: 'The service is temporarily down. Please try again in a few minutes.'
                };
                
            case 503:
                return {
                    title: 'Service Overloaded (503)',
                    message: `${providerName} is currently overloaded with requests.`,
                    action: 'The service is experiencing high traffic. Please wait and try again in a few minutes.'
                };
                
            case 504:
                return {
                    title: 'Gateway Timeout (504)',
                    message: `${providerName} took too long to respond.`,
                    action: 'The service is running slowly. Please try again with shorter content or wait a moment.'
                };
                
            default:
                return {
                    title: `HTTP Error (${status})`,
                    message: `${providerName} returned an unexpected error: ${status}`,
                    action: 'Please try again in a moment. If the problem persists, check the provider\'s status page.'
                };
        }
    }
    
    static getProviderSpecificError(message, provider) {
        const providerName = this.getProviderDisplayName(provider);
        const lowerMessage = (message || '').toLowerCase();
        
        // Claude-specific errors
        if (provider === 'claude') {
            if (lowerMessage.includes('context length') || lowerMessage.includes('too long')) {
                return {
                    title: 'Content Too Long',
                    message: 'The webpage content is too large for Claude to process.',
                    action: 'Try using the extension on a page with less content, or select a specific text portion instead.'
                };
            }
            
            if (lowerMessage.includes('safety') || lowerMessage.includes('harmful')) {
                return {
                    title: 'Content Policy Violation',
                    message: 'Claude declined to process this content due to safety policies.',
                    action: 'Try with different content that doesn\'t violate content policies.'
                };
            }
        }
        
        // OpenAI-specific errors
        if (provider === 'openai') {
            if (lowerMessage.includes('tokens') || lowerMessage.includes('context_length_exceeded')) {
                return {
                    title: 'Content Too Long',
                    message: 'The content exceeds OpenAI\'s token limit.',
                    action: 'Try with shorter content or select a specific text portion instead of the full page.'
                };
            }
            
            if (lowerMessage.includes('model_not_found') || lowerMessage.includes('model does not exist')) {
                return {
                    title: 'Model Not Available',
                    message: 'The selected OpenAI model is not available to your account.',
                    action: 'Try switching to a different model in Settings, such as GPT-4 or GPT-3.5 Turbo.'
                };
            }
        }
        
        // Gemini-specific errors
        if (provider === 'gemini') {
            if (lowerMessage.includes('safety') || lowerMessage.includes('blocked')) {
                return {
                    title: 'Safety Filter Triggered',
                    message: 'Gemini\'s safety filters prevented processing this content.',
                    action: 'Try with different content that doesn\'t trigger safety filters.'
                };
            }
            
            if (lowerMessage.includes('quota') || lowerMessage.includes('limit')) {
                return {
                    title: 'API Quota Exceeded',
                    message: 'You\'ve reached your Gemini API usage quota.',
                    action: 'Check your Google Cloud Console for quota limits and billing information.'
                };
            }
        }
        
        return null;
    }
    
    static getProviderDisplayName(provider) {
        const names = {
            'claude': 'Claude (Anthropic)',
            'openai': 'OpenAI GPT',
            'gemini': 'Google Gemini'
        };
        return names[provider] || provider;
    }
    
    static formatErrorForUser(error, provider) {
        const errorInfo = this.getErrorMessage(error, provider);
        
        return {
            title: errorInfo.title,
            message: errorInfo.message,
            action: errorInfo.action,
            fullError: error.message || error.toString()
        };
    }
}

class AIProviderService {
    constructor() {
        this.currentProvider = AI_CONFIG.DEFAULT_PROVIDER;
        this.customModels = {};
        this.customPrompts = {
            summary: '',
            explanation: ''
        };
    }

    // Switch provider dynamically
    setProvider(provider) {
        if (AI_CONFIG.PROVIDERS[provider]) {
            this.currentProvider = provider;
        }
    }

    // Update custom settings
    updateCustomSettings(models, customPrompts) {
        this.customModels = models || {};
        this.customPrompts = {
            summary: customPrompts?.summary || '',
            explanation: customPrompts?.explanation || ''
        };
        BackgroundLogger.log('Updated custom settings');
    }

    // Get current provider config with custom model if available
    getCurrentConfig() {
        const config = AI_CONFIG.PROVIDERS[this.currentProvider];
        if (this.customModels[this.currentProvider]) {
            return {
                ...config,
                model: this.customModels[this.currentProvider]
            };
        }
        return config;
    }

    // Helper method to extract page description
    extractPageDescription(pageText, maxLength = 200) {
        if (!pageText) return '';
        
        // Clean up the text and get first meaningful paragraph
        const cleanText = pageText
            .replace(/\s+/g, ' ')
            .replace(/[\r\n]+/g, ' ')
            .trim();
        
        // Look for first substantial sentence or paragraph
        const sentences = cleanText.split(/[.!?]+/);
        let description = '';
        
        for (const sentence of sentences) {
            const trimmedSentence = sentence.trim();
            if (trimmedSentence.length > 20) { // Skip very short sentences
                description = trimmedSentence;
                break;
            }
        }
        
        // Fallback to first chunk if no good sentence found
        if (!description) {
            description = cleanText.substring(0, maxLength);
        }
        
        // Ensure it's not too long
        if (description.length > maxLength) {
            description = description.substring(0, maxLength).trim() + '...';
        }
        
        return description;
    }

    // Build structured summary prompt
    buildSummaryPrompt(pageDescription, pageTitle, pageURL) {
        const systemPrompt = this.customPrompts.summary || 
            `You are an expert content analyst that creates concise, powerful summaries. Your goal is to capture the essence of any webpage in the shortest, most impactful way possible.

Guidelines:
1. Respond with valid JSON only - no additional text or explanations
2. Create a summary that is EXACTLY 3 sentences - no more, no less
3. Each sentence must be powerful, clear, and capture essential information
4. Identify 3-4 key topics that users actually care about
5. Keep topic descriptions to 1-2 sentences maximum
6. Focus on what's immediately useful or actionable
7. Use simple, direct language - avoid fluff or filler words
8. Make every word count - be precise and impactful
9. Do NOT use any emojis, icons, or special characters
10. CRITICAL: Your response must be valid JSON that can be parsed

JSON Structure:
{
  "summary": "Three powerful sentences that capture the page's core value. Each sentence should be essential and impactful. No unnecessary words or filler content.",
  "topics": [
    {
      "heading": "Clear, direct topic title",
      "description": "One or two sentences maximum that explain what matters most about this topic."
    }
  ]
}

Quality Standards - Make it SHORT and POWERFUL:
- Summary: Exactly 3 sentences, each one essential
- Topics: 3-4 topics maximum, each with 1-2 sentence descriptions
- Focus: What users need to know, not exhaustive details
- Language: Direct, clear, no unnecessary words
- NO EMOJIS: Use only plain text, no icons or special characters`;

        return [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: `Page Title: "${pageTitle}"
Page Description: "${pageDescription}"
Page URL: ${pageURL}

Create a powerful, concise summary in JSON format. Keep it short and impactful - users want quick insights, not long descriptions. Do not use any emojis or special characters.`
            }
        ];
    }

    // Build explanation prompt
    buildExplanationPrompt(pageDescription, pageTitle, pageURL, selectedText) {
        const systemPrompt = this.customPrompts.explanation || 
            `You are a concise content explainer that breaks down selected text into understandable components.

Guidelines:
1. Respond with valid JSON only - no additional text or explanations
2. Create a brief summary that explains the selected text in 2-3 sentences
3. Identify 2-4 important words, concepts, or phrases from the selected text that need explanation
4. Explain each important component in 1-2 sentences maximum
5. Focus on terms that might be unclear or interesting to understand
6. Use simple, direct language - no technical jargon unless necessary
7. Do NOT use any emojis, icons, or special characters
8. CRITICAL: Your response must be valid JSON that can be parsed

JSON Structure:
{
  "summary": "Brief 2-3 sentence explanation of what the selected text is about.",
  "topics": [
    {
      "heading": "Important word or concept from the text",
      "description": "Clear explanation of this specific term or concept in 1-2 sentences."
    }
  ]
}

Quality Standards:
- Summary: Brief overview of the selected text
- Topics: Individual important words/concepts that need clarification
- Focus: What readers need to understand to grasp the selected text
- Language: Clear, accessible explanations
- NO EMOJIS: Use only plain text, no icons or special characters`;

        return [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: `Page Title: "${pageTitle}"
Page Description: "${pageDescription}"
Page URL: ${pageURL}

Break down this selected text into understandable components. Provide a brief summary and explain the important words or concepts that readers need to understand:

"${selectedText}"`
            }
        ];
    }

    // Create OpenAI-compatible client for any provider
    createClient(provider = this.currentProvider) {
        const config = provider === this.currentProvider ? 
            this.getCurrentConfig() : 
            AI_CONFIG.PROVIDERS[provider];
            
        if (!config.apiKey) {
            throw new Error(`API key not configured for ${provider}`);
        }

        return {
            chat: {
                completions: {
                    create: async (params) => {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT);

                        try {
                            const headers = {
                                'Content-Type': 'application/json'
                            };

                            // Provider-specific authentication
                            if (provider === 'claude') {
                                headers['x-api-key'] = config.apiKey;
                                headers['anthropic-version'] = '2023-06-01';
                            } else {
                                headers['Authorization'] = `Bearer ${config.apiKey}`;
                            }

                            let requestBody;
                            let endpoint;

                            // Handle OpenAI's new Responses API
                            if (provider === 'openai' && config.useResponsesAPI) {
                                endpoint = `${config.baseURL}responses`;
                                
                                // Convert messages to OpenAI's new input format
                                let input;
                                if (params.messages.length === 1) {
                                    // Single message - use string format
                                    input = params.messages[0].content;
                                } else if (params.messages.length === 2 && params.messages[0].role === 'system') {
                                    // System + user message - combine them
                                    const systemContent = params.messages[0].content;
                                    const userContent = params.messages[1].content;
                                    input = `${systemContent}\n\n${userContent}`;
                                } else {
                                    // Multiple messages - use array format
                                    input = params.messages.map(msg => ({
                                        role: msg.role,
                                        content: msg.content
                                    }));
                                }

                                requestBody = {
                                    model: params.model || config.model,
                                    input: input,
                                    stream: params.stream || false
                                };

                                // Add optional parameters for Responses API
                                if (params.max_tokens) requestBody.max_tokens = params.max_tokens;
                                if (params.temperature) requestBody.temperature = params.temperature;
                                
                            } else {
                                // Standard chat completions format for other providers
                                endpoint = `${config.baseURL}chat/completions`;
                                
                                requestBody = {
                                    model: params.model || config.model,
                                    messages: params.messages,
                                    max_tokens: params.max_tokens || config.maxTokens,
                                    temperature: params.temperature || 0.7,
                                    stream: params.stream || false
                                };
                            }

                            // Add provider-specific parameters
                            if (provider === 'claude') {
                                // For Claude via OpenAI compatibility
                                if (params.thinking) {
                                    requestBody.thinking = params.thinking;
                                }
                            } else if (provider === 'gemini') {
                                // Gemini-specific parameters can be added here
                                if (params.reasoning_effort) {
                                    requestBody.reasoning_effort = params.reasoning_effort;
                                }
                            }

                            const response = await fetch(endpoint, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify(requestBody),
                                signal: controller.signal
                            });

                            clearTimeout(timeoutId);

                            if (!response.ok) {
                                const errorData = await response.json().catch(() => ({}));
                                throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
                            }

                            const data = await response.json();
                            
                            // Handle OpenAI Responses API format
                            if (provider === 'openai' && config.useResponsesAPI) {
                                // Convert Responses API format back to chat completions format for compatibility
                                return {
                                    choices: [{
                                        message: {
                                            content: data.output_text || data.output || data.content || ''
                                        }
                                    }]
                                };
                            }
                            
                            return data;
                        } catch (error) {
                            clearTimeout(timeoutId);
                            throw error;
                        }
                    }
                }
            }
        };
    }

    // Generic method to make AI requests
    async makeAIRequest(messages, options = {}) {
        const provider = options.provider || this.currentProvider;
        
        try {
            const client = this.createClient(provider);
            const config = this.getCurrentConfig(); // Use custom model if available
            
            const params = {
                messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || config.maxTokens,
                model: config.model, // Use the model from getCurrentConfig (includes custom)
                ...options.extra
            };

            BackgroundLogger.log(`Making AI request to ${provider}:`, {
                provider,
                model: config.model,
                messageCount: messages.length,
                systemPromptLength: messages[0]?.content?.length || 0,
                userPromptLength: messages[1]?.content?.length || 0,
                hasApiKey: !!config.apiKey,
                usingResponsesAPI: provider === 'openai' && config.useResponsesAPI,
                usingCustomModel: !!this.customModels[provider],
                usingCustomPrompts: !!(this.customPrompts.summary || this.customPrompts.explanation)
            });

            const response = await client.chat.completions.create(params);
            return response.choices[0].message.content;
        } catch (error) {
            BackgroundLogger.error(`AI request failed for ${provider}:`, error);
            throw error;
        }
    }

    // Summarize page content
    async summarizePage(content, title, url, options = {}) {
        try {
            // Handle both string content and content objects
            let pageText = '';
            let pageTitle = title || '';
            let pageUrl = url || '';

            if (typeof content === 'string') {
                pageText = content;
            } else if (content && typeof content === 'object') {
                pageText = content.text || content.content || '';
                pageTitle = content.title || title || '';
                pageUrl = content.url || url || '';
            }

            // Ensure we have some content to summarize
            if (!pageText || pageText.trim().length === 0) {
                throw new Error('No content available to summarize');
            }

            // Extract meaningful page description
            const pageDescription = this.extractPageDescription(pageText);

            // Build structured summary prompt
            const messages = this.buildSummaryPrompt(pageDescription, pageTitle, pageUrl);
            
            // Add the actual content to the user message
            messages[1].content += `\n\nContent:\n${pageText.substring(0, 8000)}`;

            BackgroundLogger.log('Using structured JSON summary prompt');

            const summary = await this.makeAIRequest(messages, options);
            
            // Log the raw response for debugging
            BackgroundLogger.log('Raw AI response:', summary);
            
            // Try to validate JSON response
            try {
                const parsed = JSON.parse(summary);
                BackgroundLogger.log('Successfully parsed JSON response:', parsed);
                
                // Validate the structure
                if (!parsed.summary || !parsed.topics || !Array.isArray(parsed.topics)) {
                    BackgroundLogger.log('JSON response missing required fields, using as-is');
                }
            } catch (jsonError) {
                BackgroundLogger.log('Response is not valid JSON, treating as plain text');
            }
            
            return { success: true, summary, provider: options.provider || this.currentProvider };
        } catch (error) {
            BackgroundLogger.error('Summary error details:', error);
            const formattedError = APIErrorHandler.formatErrorForUser(error, options.provider || this.currentProvider);
            return { 
                success: false, 
                error: formattedError.message,
                errorDetails: formattedError
            };
        }
    }

    // Explain selected text
    async explainText(selectedText, content, title, url, options = {}) {
        try {
            // Handle both string content and content objects
            let pageText = '';
            let pageTitle = title || '';
            let pageUrl = url || '';

            if (typeof content === 'string') {
                pageText = content;
            } else if (content && typeof content === 'object') {
                pageText = content.text || content.content || '';
                pageTitle = content.title || title || '';
                pageUrl = content.url || url || '';
            }

            // Extract page description from content (first 200 chars as fallback)
            const pageDescription = this.extractPageDescription(pageText);

            const messages = this.buildExplanationPrompt(pageDescription, pageTitle, pageUrl, selectedText);
            
            // Add context content to the user message
            messages[1].content += `\n\nContext (surrounding content):\n${pageText.substring(0, 4000)}`;

            BackgroundLogger.log('Using structured JSON explanation prompt');

            const explanation = await this.makeAIRequest(messages, options);
            
            // Log the raw response for debugging
            BackgroundLogger.log('Raw AI explanation response:', explanation);
            
            // Try to validate JSON response
            try {
                const parsed = JSON.parse(explanation);
                BackgroundLogger.log('Successfully parsed JSON explanation response:', parsed);
                
                // Validate the structure
                if (!parsed.summary || !parsed.topics || !Array.isArray(parsed.topics)) {
                    BackgroundLogger.log('JSON explanation response missing required fields, using as-is');
                }
            } catch (jsonError) {
                BackgroundLogger.log('Explanation response is not valid JSON, treating as plain text');
            }
            
            return { success: true, explanation, provider: options.provider || this.currentProvider };
        } catch (error) {
            BackgroundLogger.error('Explanation error details:', error);
            const formattedError = APIErrorHandler.formatErrorForUser(error, options.provider || this.currentProvider);
            return { 
                success: false, 
                error: formattedError.message,
                errorDetails: formattedError
            };
        }
    }
}

// Initialize the AI service
const aiService = new AIProviderService();

// Message listener for handling extension requests
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    try {
        switch (message.type) {
            case "show_toolbar_popup":
                BackgroundLogger.log('Background: show_toolbar_popup received', {
                    url: message.url,
                    title: message.title,
                    hasSelectedText: !!message.selectedText
                });
                await browser.action.openPopup();
                sendResponse({ success: true });
                break;
                
            case "summarize_page":
                const summary = await aiService.summarizePage(
                    message.content,
                    message.title,
                    message.url,
                    { provider: message.provider }
                );
                sendResponse(summary);
                break;
                
            case "explain_selected_text":
                const explanation = await aiService.explainText(
                    message.selectedText,
                    message.content,
                    message.title,
                    message.url,
                    { provider: message.provider }
                );
                sendResponse(explanation);
                break;
                
            case "set_ai_provider":
                aiService.setProvider(message.provider);
                sendResponse({ success: true, provider: message.provider });
                break;
                
            case "get_ai_providers":
                sendResponse({ 
                    success: true, 
                    providers: Object.keys(AI_CONFIG.PROVIDERS),
                    current: aiService.currentProvider
                });
                break;
                
            case "update_api_key":
                if (AI_CONFIG.PROVIDERS[message.provider]) {
                    AI_CONFIG.PROVIDERS[message.provider].apiKey = message.apiKey;
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: "Invalid provider" });
                }
                break;
                
            case "update_custom_settings":
                aiService.updateCustomSettings(message.models, message.customPrompts);
                sendResponse({ success: true });
                break;
                
            default:
                sendResponse({ success: false, error: "Unknown message type" });
        }
    } catch (error) {
        BackgroundLogger.error('Error in message handler:', error);
        sendResponse({ success: false, error: error.message });
    }
    return true; // Indicates async response
});

// External message listener
browser.runtime.onMessageExternal.addListener(function(message, sender, sendResponse) {
    if (message.action == "determineID") {
        sendResponse({ response: "Extension installed" });
    }
});

// Storage API for persisting settings
class SettingsManager {
    static async saveSettings(settings) {
        return new Promise((resolve) => {
            browser.storage.local.set(settings, () => {
                resolve();
            });
        });
    }

    static async loadSettings() {
        return new Promise((resolve) => {
            browser.storage.local.get(null, (result) => {
                resolve(result);
            });
        });
    }

    static async initializeSettings() {
        const settings = await this.loadSettings();
        
        // Apply saved API keys
        if (settings.claudeApiKey) AI_CONFIG.PROVIDERS.claude.apiKey = settings.claudeApiKey;
        if (settings.openaiApiKey) AI_CONFIG.PROVIDERS.openai.apiKey = settings.openaiApiKey;
        if (settings.geminiApiKey) AI_CONFIG.PROVIDERS.gemini.apiKey = settings.geminiApiKey;
        
        // Apply saved provider preference
        if (settings.defaultProvider) {
            aiService.setProvider(settings.defaultProvider);
        }
    }
}

// Initialize settings on startup
SettingsManager.initializeSettings();
