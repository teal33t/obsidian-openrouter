import { requestUrl, RequestUrlParam, Notice } from 'obsidian';
import { OpenRouterChatSettings } from './main'; // Import settings interface

// Define the structure for the message object expected by OpenRouter
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// Define the structure for the API request body
interface OpenRouterRequestBody {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number | null;
    stream?: boolean; // Optional: for streaming responses
    // Add other parameters like top_p, frequency_penalty etc. if needed
}

// Define the structure for a minimal successful API response
interface OpenRouterSuccessResponse {
    choices: {
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    // Include other fields like 'usage' if needed
}

// Define the structure for an API error response
interface OpenRouterErrorResponse {
    error: {
        message: string;
        type: string;
        param: string | null;
        code: string | null;
    };
}

// Define structure for the model list response
interface OpenRouterModel {
    id: string;
    name: string;
    // Add other model properties if needed (e.g., context_length, pricing)
}

interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}

// API Service Class - Enhanced
export class OpenRouterAPI {
    private apiKey: string;
    private defaultModel: string;
    private readonly baseApiUrl = 'https://openrouter.ai/api/v1';

    constructor(apiKey: string, defaultModel: string) {
        this.apiKey = apiKey;
        this.defaultModel = defaultModel;
    }

    updateApiKey(newKey: string) {
        this.apiKey = newKey;
    }

    updateDefaultModel(newModel: string) {
        this.defaultModel = newModel;
    }

    // Method to fetch available models
    async fetchModels(): Promise<{ id: string, name: string }[]> {
        if (!this.apiKey) {
            console.error('API Key not set. Cannot fetch models.');
            // Return an empty array or throw an error, depending on desired handling
            return [];
        }

        const requestParams: RequestUrlParam = {
            url: `${this.baseApiUrl}/models`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
            },
            throw: false // Handle errors manually
        };

        try {
            const response = await requestUrl(requestParams);
            if (response.status === 200) {
                const data = response.json as OpenRouterModelsResponse;
                // Sort models by name for better display
                return data.data.sort((a, b) => a.name.localeCompare(b.name));
            } else {
                console.error(`Error fetching models: Status ${response.status}`, response.text);
                const errorData = response.json as OpenRouterErrorResponse;
                const errorMessage = errorData?.error?.message || `Failed to fetch models (Status ${response.status})`;
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Network or parsing error fetching models:', error);
            throw new Error(`Failed to communicate with OpenRouter to fetch models. ${error.message}`);
        }
    }

    // Method to send chat request, now including settings
    async sendChatRequest(messages: ChatMessage[], settings: OpenRouterChatSettings): Promise<string> {
        if (!settings.apiKey) {
            console.error('OpenRouter API Key is not set.');
            return Promise.reject('API Key not configured. Please set it in the plugin settings.');
        }

        // Prepare messages, potentially adding system prompt
        let apiMessages = [...messages];
        if (settings.systemPrompt && settings.systemPrompt.trim() !== '') {
            // Check if system prompt already exists (e.g., from history)
            const hasSystemPrompt = apiMessages.some(msg => msg.role === 'system');
            if (!hasSystemPrompt) {
                apiMessages.unshift({ role: 'system', content: settings.systemPrompt });
            }
            // If it exists, decide whether to replace or keep existing (current logic keeps existing)
        }

        const requestBody: OpenRouterRequestBody = {
            model: settings.defaultModel, // Use model from settings
            messages: apiMessages,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens, // Pass null if not set
            // stream: false, // Default to non-streaming
        };

        // Remove null/undefined optional parameters
        if (requestBody.max_tokens === null) {
            delete requestBody.max_tokens;
        }
        if (requestBody.temperature === null || requestBody.temperature === undefined) {
             delete requestBody.temperature; // Or set a default if API requires it
        }

        const requestParams: RequestUrlParam = {
            url: `${this.baseApiUrl}/chat/completions`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            throw: false // Handle errors manually
        };

        try {
            console.log('Sending request to OpenRouter:', requestParams.url, JSON.stringify(requestBody, null, 2));
            const response = await requestUrl(requestParams);
            console.log('Received response from OpenRouter:', response.status, response.text);

            if (response.status >= 200 && response.status < 300) {
                const data = response.json as OpenRouterSuccessResponse;
                if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                    return data.choices[0].message.content;
                } else {
                    console.error('Invalid response structure from OpenRouter:', data);
                    return Promise.reject('Received an unexpected response structure from the API.');
                }
            } else {
                const errorData = response.json as OpenRouterErrorResponse;
                console.error('OpenRouter API Error:', errorData);
                const errorMessage = errorData?.error?.message || `API request failed with status ${response.status}`;
                return Promise.reject(errorMessage);
            }
        } catch (error) {
            console.error('Error sending request to OpenRouter:', error);
            return Promise.reject(`Failed to communicate with the OpenRouter API. ${error.message}`);
        }
    }
}

