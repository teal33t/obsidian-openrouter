import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, MarkdownView, TFile, App, setIcon } from 'obsidian';
import OpenRouterChatPlugin, { OpenRouterChatSettings } from './main'; // Import main plugin and settings
import { OpenRouterAPI, ChatMessage } from './api';
import { ContextSelectionModal, ContextSelectionResult } from './context_modal';
import { ContextManager, FormattedContext } from './context_manager';
// HistorySaver is now accessed via plugin instance: this.plugin.historySaver

export const VIEW_TYPE_CHAT = "openrouter-chat-view";

// Chat View Class - File History Enhancements
export class ChatView extends ItemView {
    plugin: OpenRouterChatPlugin;
    chatContainer: HTMLElement;
    inputEl: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    manageContextButton: HTMLButtonElement;
    newChatButton: HTMLButtonElement;
    contextDisplayArea: HTMLElement;
    history: ChatMessage[] = []; // Current session history, starts empty
    isSending: boolean = false;
    contextManager: ContextManager;
    selectedContextPaths: string[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: OpenRouterChatPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.contextManager = new ContextManager(this.app);
    }

    getViewType() {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText() {
        return "OpenRouter Chat";
    }

    getIcon() {
        return "message-circle";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('openrouter-chat-view-container');

        // Header Area
        const headerArea = container.createDiv({ cls: 'chat-header-area' });
        const contextManagementArea = headerArea.createDiv({ cls: 'chat-context-management-area' });
        this.manageContextButton = contextManagementArea.createEl('button', { text: 'Manage Context', cls: 'manage-context-button' });
        this.manageContextButton.addEventListener('click', () => this.openContextModal());
        this.contextDisplayArea = contextManagementArea.createDiv({ cls: 'context-display-area' });
        this.newChatButton = headerArea.createEl('button', { cls: 'new-chat-button', attr: { 'aria-label': 'New Chat & Save Current' } });
        setIcon(this.newChatButton, 'plus'); // Use plus icon
        this.newChatButton.addEventListener('click', () => this.startNewChat());

        // Chat history display area
        this.chatContainer = container.createDiv({ cls: 'chat-history-container' });

        // Input area
        const inputContainer = container.createDiv({ cls: 'chat-input-container' });
        this.inputEl = inputContainer.createEl('textarea', { cls: 'chat-input-textarea', attr: { placeholder: 'Type your message (Shift+Enter for newline)...' } });
        this.sendButton = inputContainer.createEl('button', { text: 'Send', cls: 'chat-send-button' });

        // Event listeners
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
        });
        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = `${this.inputEl.scrollHeight}px`;
        });

        // View always starts empty now, no history loading needed here
        this.updateContextDisplay();
        this.renderHistory(); // Render the initial empty state
    }

    async onClose() {
        // Decide if we want to auto-save on close. Let's NOT do this for now.
        // Saving is explicitly triggered by the "New Chat" button.
        // If the user closes the view/Obsidian without clicking "New Chat", the current session is lost (unless they re-open the view).
        console.log("Chat view closed. Current session not saved unless 'New Chat' was clicked.");
    }

    // Removed handleSettingsUpdate as it's no longer needed for history

    // Removed loadHistory and saveHistory methods (related to plugin data storage)

    async startNewChat() {
        // 1. Save the current session if enabled and history exists
        if (this.plugin.settings.saveChatToFile && this.history.length > 0) {
            // Disable button while saving
            this.newChatButton.disabled = true;
            try {
                await this.plugin.historySaver.saveChatSession(this.history, this.plugin.settings, this.selectedContextPaths);
                // Notice is shown by the saver
            } catch (error) {
                // Error notice is shown by the saver
            } finally {
                 this.newChatButton.disabled = false;
            }
        }

        // 2. Clear the current state
        this.history = [];
        this.selectedContextPaths = [];
        this.updateContextDisplay();
        this.renderHistory();
        this.inputEl.value = ''; // Clear input field as well
        this.inputEl.style.height = 'auto';
        this.inputEl.focus();

        if (this.plugin.settings.saveChatToFile) {
             new Notice("Current chat saved (if enabled). New chat started.");
        } else {
             new Notice("New chat started.");
        }
    }

    openContextModal() {
        new ContextSelectionModal(this.app, this.selectedContextPaths, (result: ContextSelectionResult) => {
            this.selectedContextPaths = result.selectedPaths;
            this.updateContextDisplay();
            new Notice(`Updated context selection: ${this.selectedContextPaths.length} items selected.`);
        }).open();
    }

    updateContextDisplay() {
        this.contextDisplayArea.empty();
        if (this.selectedContextPaths.length === 0) {
            this.contextDisplayArea.createSpan({ text: 'Context: None', cls: 'context-placeholder' });
        } else {
            this.selectedContextPaths.forEach(path => {
                const itemEl = this.contextDisplayArea.createDiv({ cls: 'context-item-tag' });
                const fileName = path.split('/').pop() || path;
                itemEl.createSpan({ text: fileName, cls: 'context-item-name' });
                itemEl.title = path;
                const removeButton = itemEl.createEl('button', { cls: 'context-item-remove', attr: { 'aria-label': 'Remove context item' } });
                setIcon(removeButton, 'x');
                removeButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectedContextPaths = this.selectedContextPaths.filter(p => p !== path);
                    this.updateContextDisplay();
                });
            });
        }
    }

    renderHistory() {
        this.chatContainer.empty();
        if (this.history.length === 0) {
            this.chatContainer.createEl('p', { text: 'Start chatting with OpenRouter!', cls: 'chat-welcome-message' });
        }
        this.history.forEach(msg => this.addMessageToDisplay(msg));
        this.scrollToBottom();
    }

    addMessageToDisplay(message: ChatMessage) {
        const messageEl = this.chatContainer.createDiv({ cls: `chat-message message-${message.role}` });
        const contentContainer = messageEl.createDiv({ cls: 'rendered-markdown' });

        if (message.role === 'assistant') {
            MarkdownRenderer.renderMarkdown(message.content, contentContainer, this.app.vault.getRoot().path, this.plugin);
        } else if (message.role === 'user') {
            contentContainer.createEl('strong', { text: 'You: ' });
            contentContainer.appendText(message.content);
        } else { // System messages
             contentContainer.addClass('message-system');
             MarkdownRenderer.renderMarkdown(message.content, contentContainer, this.app.vault.getRoot().path, this.plugin);
        }
        this.scrollToBottom();
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            if (this.chatContainer) {
                this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
            }
        });
    }

    async sendMessage() {
        if (this.isSending) return;
        const messageContent = this.inputEl.value.trim();
        if (!messageContent) return;
        const currentSettings = this.plugin.settings;
        if (!currentSettings.apiKey) {
            new Notice('OpenRouter API Key is not configured.');
            return;
        }

        this.isSending = true;
        this.sendButton.disabled = true;
        this.inputEl.disabled = true;
        this.manageContextButton.disabled = true;
        this.newChatButton.disabled = true;

        const userMessage: ChatMessage = { role: 'user', content: messageContent };
        this.history.push(userMessage);
        this.addMessageToDisplay(userMessage);
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';

        const thinkingEl = this.chatContainer.createDiv({ cls: 'chat-message message-assistant thinking' });
        thinkingEl.createSpan({ text: 'AI is thinking...' });
        this.scrollToBottom();

        let formattedContext: FormattedContext | null = null;
        try {
            // Context Processing
            if (this.selectedContextPaths.length > 0) {
                const contextProcessingNotice = new Notice('Processing context...', 0);
                try {
                    formattedContext = await this.contextManager.getFormattedContext(this.selectedContextPaths);
                    contextProcessingNotice.hide();
                    if (formattedContext.warnings.length > 0) {
                        new Notice(`Context Warnings:\n${formattedContext.warnings.join('\n')}`, 10000);
                    }
                } catch (contextError) {
                    contextProcessingNotice.hide();
                    console.error("Error processing context:", contextError);
                    new Notice(`Failed to process context: ${contextError.message}`, 5000);
                    this.isSending = false;
                    this.sendButton.disabled = false;
                    this.inputEl.disabled = false;
                    this.manageContextButton.disabled = false;
                    this.newChatButton.disabled = false;
                    thinkingEl.remove();
                    return;
                }
            }

            let historyForAPI = [...this.history];

            // Add system prompt
            if (currentSettings.systemPrompt && currentSettings.systemPrompt.trim() !== '') {
                 const hasSystemPrompt = historyForAPI.some(msg => msg.role === 'system' && msg.content === currentSettings.systemPrompt);
                 if (!hasSystemPrompt) {
                     historyForAPI.unshift({ role: 'system', content: currentSettings.systemPrompt });
                 }
            }

            // Add formatted context
            if (formattedContext && formattedContext.contextString) {
                const contextSystemMessage: ChatMessage = {
                    role: 'system',
                    content: `--- Provided Context ---\n${formattedContext.contextString}\n--- End Context ---`
                };
                historyForAPI.splice(historyForAPI.length - 1, 0, contextSystemMessage);
            }

            // Send to API
            const aiResponseContent = await this.plugin.api.sendChatRequest(historyForAPI, currentSettings);
            const aiMessage: ChatMessage = { role: 'assistant', content: aiResponseContent };

            thinkingEl.remove();
            this.history.push(aiMessage);
            this.addMessageToDisplay(aiMessage);

            // No history saving here - only happens on "New Chat"

        } catch (error) {
            thinkingEl.remove();
            console.error('Error getting response from OpenRouter:', error);
            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : 'Failed to get response from AI. Check console.');
            new Notice(errorMessage);
            const errorDisplay: ChatMessage = { role: 'system', content: `Error: ${errorMessage}` };
            this.addMessageToDisplay(errorDisplay);

        } finally {
            this.isSending = false;
            this.sendButton.disabled = false;
            this.inputEl.disabled = false;
            this.manageContextButton.disabled = false;
            this.newChatButton.disabled = false;
            this.inputEl.focus();
        }
    }
}

