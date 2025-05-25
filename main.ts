import { App, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, requestUrl, MarkdownRenderer, MarkdownView, moment, setIcon, TFolder } from 'obsidian'; // Added setIcon, TFolder
import { ChatView, VIEW_TYPE_CHAT } from './chat_view';
import { OpenRouterAPI } from './api';
import { ChatMessage } from './api';
import { HistorySaver } from './history_saver';
import { FolderPickerModal } from './folder_picker_modal'; // Import the new modal

// Settings interface remains the same
export interface OpenRouterChatSettings {
	apiKey: string;
	defaultModel: string;
    temperature: number;
    maxTokens: number | null;
    systemPrompt: string;
    saveChatToFile: boolean;
    historyFolderPath: string;
}

// Defaults remain the same
export const DEFAULT_SETTINGS: OpenRouterChatSettings = {
	apiKey: '',
	defaultModel: 'openai/gpt-3.5-turbo',
    temperature: 1,
    maxTokens: null,
    systemPrompt: 'You are a helpful assistant running within Obsidian.',
    saveChatToFile: false,
    historyFolderPath: 'OpenRouter Chats',
}

// Main Plugin Class remains largely the same
export default class OpenRouterChatPlugin extends Plugin {
	settings: OpenRouterChatSettings;
    api: OpenRouterAPI;
    historySaver: HistorySaver;

	async onload() {
		console.log('Loading OpenRouter Chat plugin');
		await this.loadSettings();
        this.api = new OpenRouterAPI(this.settings.apiKey, this.settings.defaultModel);
        this.historySaver = new HistorySaver(this.app);
		this.addSettingTab(new OpenRouterChatSettingTab(this.app, this));
        this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
		this.addCommand({
			id: 'open-openrouter-chat-view',
			name: 'Open OpenRouter Chat',
			callback: () => { this.activateView(); }
		});
		this.addRibbonIcon('message-circle', 'OpenRouter Chat', (evt: MouseEvent) => { this.activateView(); });
        await this.loadCss();
		console.log('OpenRouter Chat plugin loaded.');
	}

	onunload() {
		console.log("Unloading OpenRouter Chat plugin");
        // Removed: this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT); // Avoid detaching leaves in onunload as per Obsidian guidelines
        const styleEl = document.getElementById("openrouter-chat-styles");
        if (styleEl) { styleEl.remove(); }
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
        if (this.api) {
            this.api.updateApiKey(this.settings.apiKey);
            this.api.updateDefaultModel(this.settings.defaultModel);
        }
	}

    async loadCss() {
        try {
            const cssPath = `${this.manifest.dir}/styles.css`;
            if (await this.app.vault.adapter.exists(cssPath)) {
                const css = await this.app.vault.adapter.read(cssPath);
                let styleEl = document.getElementById('openrouter-chat-styles');
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'openrouter-chat-styles';
                    document.head.appendChild(styleEl);
                }
                styleEl.textContent = css;
            } else {
                 console.warn("styles.css not found for OpenRouter Chat plugin.");
            }
        } catch (error) {
            console.error("Error loading styles.css:", error);
            new Notice("Failed to load OpenRouter Chat styles.");
        }
    }

	async activateView() {
        const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
        if (existingLeaves.length > 0) {
            this.app.workspace.revealLeaf(existingLeaves[0]);
            return;
        }
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
            this.app.workspace.revealLeaf(leaf);
        } else {
            new Notice('Could not get a leaf in the right sidebar.');
        }
	}
}

// Settings Tab Class - Updated for Folder Picker
class OpenRouterChatSettingTab extends PluginSettingTab {
	plugin: OpenRouterChatPlugin;
    models: { id: string, name: string }[] = [];
    fetchingModels = false;

	constructor(app: App, plugin: OpenRouterChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

    async fetchModels() {
        // ... (fetchModels implementation remains the same)
        if (!this.plugin.settings.apiKey) { this.models = []; return; }
        if (this.fetchingModels) return;
        this.fetchingModels = true;
        try {
            this.models = await this.plugin.api.fetchModels();
        } catch (error) {
            console.error("Error fetching models:", error);
            new Notice("Failed to fetch models. Check API key/console.");
            this.models = [];
        } finally {
            this.fetchingModels = false;
            this.display();
        }
    }

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'OpenRouter Chat Settings'});

        // --- API & Model Settings --- (Unchanged)
		new Setting(containerEl)
			.setName('OpenRouter API Key')
			.setDesc('Enter your OpenRouter API key.')
			.addText(text => {
                text.setPlaceholder('sk-or-...').setValue(this.plugin.settings.apiKey).inputEl.type = 'password';
                text.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                    this.fetchModels();
				});
            });

        const modelSetting = new Setting(containerEl).setName('Default Model').setDesc('Select the default chat model.');
        if (this.fetchingModels) { modelSetting.setDesc('Fetching models...'); }
        else if (this.models.length > 0) {
            const modelOptions = this.models.reduce((acc, model) => { acc[model.id] = model.name; return acc; }, {} as Record<string, string>);
            modelSetting.addDropdown(dropdown => dropdown.addOptions(modelOptions).setValue(this.plugin.settings.defaultModel).onChange(async (value) => { this.plugin.settings.defaultModel = value; await this.plugin.saveSettings(); }));
        } else {
            modelSetting.setDesc('Could not fetch models. Enter API key or check console.');
            modelSetting.addButton(button => button.setButtonText('Retry Fetch Models').onClick(() => this.fetchModels()));
        }

        new Setting(containerEl).setName('Temperature').setDesc('Controls randomness (0.0 to 2.0).').addText(text => text.setPlaceholder(DEFAULT_SETTINGS.temperature.toString()).setValue(this.plugin.settings.temperature.toString()).onChange(async (value) => { let numValue = parseFloat(value); numValue = isNaN(numValue) ? DEFAULT_SETTINGS.temperature : Math.max(0, Math.min(2, numValue)); this.plugin.settings.temperature = numValue; await this.plugin.saveSettings(); text.setValue(numValue.toString()); }));
        new Setting(containerEl).setName('Max Tokens').setDesc('Max tokens per completion (blank for default).').addText(text => text.setPlaceholder('Model default').setValue(this.plugin.settings.maxTokens?.toString() || '').onChange(async (value) => { const numValue = parseInt(value, 10); this.plugin.settings.maxTokens = (isNaN(numValue) || numValue <= 0) ? null : numValue; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('System Prompt').setDesc('Initial instruction for the AI model.').addTextArea(text => { text.setPlaceholder(DEFAULT_SETTINGS.systemPrompt).setValue(this.plugin.settings.systemPrompt).onChange(async (value) => { this.plugin.settings.systemPrompt = value; await this.plugin.saveSettings(); }); text.inputEl.rows = 4; text.inputEl.addClass('system-prompt-textarea'); });

        // --- File History Settings --- UPDATED
        containerEl.createEl('h3', { text: 'Chat History Saving' });

        new Setting(containerEl)
            .setName('Save Chats to Files')
            .setDesc('Save each completed chat session as a Markdown file.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.saveChatToFile)
                .onChange(async (value) => {
                    this.plugin.settings.saveChatToFile = value;
                    await this.plugin.saveSettings();
                    this.display(); // Re-render to show/hide folder path setting
                }));

        if (this.plugin.settings.saveChatToFile) {
            let folderInputEl: HTMLInputElement;
            new Setting(containerEl)
                .setName('History Folder Path')
                .setDesc('Path relative to vault root where chat files will be saved.')
                .addText(text => {
                    folderInputEl = text.inputEl; // Store reference to update later
                    text.setPlaceholder(DEFAULT_SETTINGS.historyFolderPath)
                        .setValue(this.plugin.settings.historyFolderPath)
                        .onChange(async (value) => {
                            const cleanedPath = value.trim().replace(/^\/+|\/+$/g, '');
                            this.plugin.settings.historyFolderPath = cleanedPath || DEFAULT_SETTINGS.historyFolderPath;
                            await this.plugin.saveSettings();
                            // Update the input field to show cleaned path immediately
                            text.setValue(this.plugin.settings.historyFolderPath);
                        });
                })
                // --- Add Folder Picker Button --- NEW
                .addExtraButton(button => {
                    button
                        .setIcon("folder-open") // Use a suitable icon
                        .setTooltip("Browse folders")
                        .onClick(() => {
                            new FolderPickerModal(this.app, this.plugin.settings.historyFolderPath, async (selectedPath) => {
                                // Callback function when a folder is selected in the modal
                                this.plugin.settings.historyFolderPath = selectedPath;
                                await this.plugin.saveSettings();
                                // Update the text input field visually
                                if (folderInputEl) {
                                    folderInputEl.value = selectedPath;
                                }
                            }).open();
                        });
                });
                // -----------------------------------
        }

        // Fetch models if needed
        if (this.models.length === 0 && !this.fetchingModels && this.plugin.settings.apiKey) {
            this.fetchModels();
        }
	}
}

