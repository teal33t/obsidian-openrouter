import { App, Modal, TFolder, TAbstractFile, setIcon } from "obsidian";

export class FolderPickerModal extends Modal {
    private selectedPath: string | null = null;
    private highlightedElement: HTMLElement | null = null;
    private callback: (selectedPath: string) => void;

    constructor(app: App, currentPath: string, callback: (selectedPath: string) => void) {
        super(app);
        this.selectedPath = currentPath; // Pre-select current path if valid
        this.callback = callback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("openrouter-folder-picker-modal");
        contentEl.createEl("h2", { text: "Select History Folder" });

        const scrollContainer = contentEl.createDiv({ cls: "folder-picker-scroll-container" });
        this.renderFolder(this.app.vault.getRoot(), scrollContainer, 0);

        // Action buttons
        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
        buttonContainer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());

        const selectButton = buttonContainer.createEl("button", { text: "Select", cls: "mod-cta" });
        selectButton.disabled = !this.selectedPath; // Disable if nothing selected initially
        selectButton.addEventListener("click", () => {
            if (this.selectedPath) {
                this.callback(this.selectedPath);
                this.close();
            }
        });

        // Pre-highlight the current selection if it exists
        if (this.selectedPath) {
            const initialElement = contentEl.querySelector(`[data-path="${this.selectedPath.replace(/"/g, '\\"')}"]`);
            if (initialElement instanceof HTMLElement) {
                this.highlightSelection(initialElement);
            }
        }
    }

    renderFolder(folder: TFolder, container: HTMLElement, level: number) {
        // Sort children: folders first, then alphabetically
        const children = folder.children.sort((a, b) => {
            const isAFolder = a instanceof TFolder;
            const isBFolder = b instanceof TFolder;
            if (isAFolder !== isBFolder) {
                return isAFolder ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        children.forEach(item => {
            if (item instanceof TFolder) {
                const folderEl = container.createDiv({ cls: "folder-picker-item" });
                folderEl.style.marginLeft = `${level * 20}px`; // Indentation
                folderEl.dataset.path = item.path; // Store path for selection

                const iconEl = folderEl.createSpan({ cls: "folder-picker-icon" });
                setIcon(iconEl, "folder");

                folderEl.createSpan({ text: item.name, cls: "folder-picker-name" });

                folderEl.addEventListener("click", () => {
                    this.selectedPath = item.path;
                    this.highlightSelection(folderEl);
                    // Enable select button
                    const selectButton = this.contentEl.querySelector(".modal-button-container .mod-cta") as HTMLButtonElement;
                    if (selectButton) selectButton.disabled = false;
                });

                // Recursively render subfolders
                this.renderFolder(item, container, level + 1);
            }
        });
    }

    highlightSelection(targetElement: HTMLElement) {
        // Remove highlight from previous selection
        if (this.highlightedElement) {
            this.highlightedElement.removeClass("is-selected");
        }
        // Add highlight to new selection
        targetElement.addClass("is-selected");
        this.highlightedElement = targetElement;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

