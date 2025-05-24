import { App, Vault, Notice, moment } from "obsidian";
import { ChatMessage } from "./api";
import { OpenRouterChatSettings } from "./main";

export class HistorySaver {
    private app: App;
    private vault: Vault;

    constructor(app: App) {
        this.app = app;
        this.vault = app.vault;
    }

    private formatChatToMarkdown(history: ChatMessage[], settings: OpenRouterChatSettings, contextPaths: string[]): string {
        let markdownContent = "";

        // --- YAML Frontmatter ---
        const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
        markdownContent += "---\
";
        markdownContent += `model: ${settings.defaultModel}\n`;
        markdownContent += `timestamp: ${timestamp}\n`;
        if (contextPaths.length > 0) {
            markdownContent += "context_items:\n";
            contextPaths.forEach(path => {
                markdownContent += `  - "${path.replace(/"/g, '\\"')}"\n`; // Escape quotes in paths
            });
        }
        markdownContent += "---\
\n";

        // --- Chat Messages ---
        history.forEach(message => {
            if (message.role === "user") {
                markdownContent += `### User\n${message.content}\n\n`;
            } else if (message.role === "assistant") {
                markdownContent += `### Assistant\n${message.content}\n\n`;
            } else if (message.role === "system") {
                // Optionally include system messages, maybe formatted differently
                // For now, let's omit context system messages but keep the initial one if present
                if (message.content !== settings.systemPrompt && !message.content.startsWith("--- Provided Context ---")) {
                     markdownContent += `> [!NOTE] System Message\n> ${message.content}\n\n`;
                }
            }
        });

        return markdownContent.trim();
    }

    async saveChatSession(history: ChatMessage[], settings: OpenRouterChatSettings, contextPaths: string[]): Promise<void> {
        if (!settings.saveChatToFile || history.length === 0) {
            return; // Don't save if disabled or history is empty
        }

        const folderPath = settings.historyFolderPath;
        const timestamp = moment().format("YYYYMMDD-HHmmss");
        const fileName = `Chat-${timestamp}.md`;
        const filePath = `${folderPath}/${fileName}`;

        try {
            // Ensure folder exists
            const folderExists = await this.vault.adapter.exists(folderPath);
            if (!folderExists) {
                await this.vault.createFolder(folderPath);
                new Notice(`Created history folder: ${folderPath}`);
            }

            // Format content
            const markdownContent = this.formatChatToMarkdown(history, settings, contextPaths);

            // Create the file
            await this.vault.create(filePath, markdownContent);
            new Notice(`Chat saved to: ${filePath}`);

        } catch (error) {
            console.error("Error saving chat session:", error);
            new Notice(`Failed to save chat to ${filePath}. Check console for details.`);
        }
    }
}

