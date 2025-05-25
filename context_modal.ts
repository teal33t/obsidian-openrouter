import { App, Modal, Vault, TAbstractFile, TFolder, TFile, Notice } from "obsidian";

// Interface for the data returned by the modal
export interface ContextSelectionResult {
    selectedPaths: string[];
}

export class ContextSelectionModal extends Modal {
    private selectedPaths: Set<string>;
    private resultCallback: (result: ContextSelectionResult) => void;

    constructor(app: App, currentSelection: string[], callback: (result: ContextSelectionResult) => void) {
        super(app);
        this.selectedPaths = new Set(currentSelection);
        this.resultCallback = callback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("openrouter-context-modal");
        contentEl.createEl("h2", { text: "Select Context Files/Folders" });

        const browserEl = contentEl.createDiv({ cls: "context-file-browser" });
        this.renderFolder(this.app.vault.getRoot(), browserEl, 0);

        // Action buttons
        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
        buttonContainer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
        buttonContainer.createEl("button", { text: "Clear Selection", cls: "mod-warning" }).addEventListener("click", () => {
            this.selectedPaths.clear();
            this.onOpen(); // Re-render to reflect cleared selection
        });
        buttonContainer.createEl("button", { text: "Confirm", cls: "mod-cta" }).addEventListener("click", () => {
            this.resultCallback({ selectedPaths: Array.from(this.selectedPaths) });
            this.close();
        });
    }

    renderFolder(folder: TFolder, container: HTMLElement, level: number) {
        const children = folder.children.sort((a, b) => {
            // Sort folders first, then files, then alphabetically
            const isAFolder = a instanceof TFolder;
            const isBFolder = b instanceof TFolder;
            if (isAFolder !== isBFolder) {
                return isAFolder ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        children.forEach(item => {
            const itemEl = container.createDiv({ cls: "context-item" });
            itemEl.style.setProperty('--indent-level', `${level}`); // Indentation via CSS var

            const checkbox = itemEl.createEl("input", { type: "checkbox" });
            checkbox.checked = this.selectedPaths.has(item.path);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    this.selectedPaths.add(item.path);
                } else {
                    this.selectedPaths.delete(item.path);
                }
                // Optional: Add logic to auto-select/deselect children if a folder is selected/deselected
            });

            const label = itemEl.createEl("label");
            const icon = item instanceof TFolder ? "📁" : (item instanceof TFile && item.extension === "md" ? "📄" : "❔");
            label.setText(`${icon} ${item.name}`);
            label.prepend(checkbox); // Put checkbox inside label for better click handling

            if (item instanceof TFolder) {
                // Recursively render subfolders
                // Could add expand/collapse functionality here for performance with large vaults
                this.renderFolder(item, container, level + 1);
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

