import { App, TAbstractFile, TFile, TFolder, Vault, Notice } from 'obsidian';

const MAX_CONTEXT_CHARS = 50000; // Example limit, make configurable later?

export interface FormattedContext {
    contextString: string;
    includedFiles: string[];
    warnings: string[];
}

export class ContextManager {
    private app: App;
    private vault: Vault;

    constructor(app: App) {
        this.app = app;
        this.vault = app.vault;
    }

    async getFormattedContext(selectedPaths: string[]): Promise<FormattedContext> {
        let aggregatedContent = '';
        const includedFiles: string[] = [];
        const warnings: string[] = [];
        let charCount = 0;

        for (const path of selectedPaths) {
            if (charCount >= MAX_CONTEXT_CHARS) {
                warnings.push(`Context limit (${MAX_CONTEXT_CHARS} characters) reached. Some selections may have been omitted.`);
                break; // Stop processing if limit reached
            }

            const fileOrFolder = this.vault.getAbstractFileByPath(path);
            if (!fileOrFolder) {
                warnings.push(`Selected item not found: ${path}`);
                continue;
            }

            if (fileOrFolder instanceof TFile) {
                if (fileOrFolder.extension === 'md') {
                    try {
                        const content = await this.vault.cachedRead(fileOrFolder);
                        const formattedFileContent = `--- File: ${fileOrFolder.path} ---\n${content}\n--- End File: ${fileOrFolder.path} ---\n\n`;
                        if (charCount + formattedFileContent.length <= MAX_CONTEXT_CHARS) {
                            aggregatedContent += formattedFileContent;
                            charCount += formattedFileContent.length;
                            includedFiles.push(fileOrFolder.path);
                        } else {
                             // Try adding truncated content if possible
                             const remainingChars = MAX_CONTEXT_CHARS - charCount;
                             if (remainingChars > 100) { // Only add if reasonable space left
                                const truncatedContent = content.substring(0, remainingChars - 80); // Estimate header/footer size
                                const truncatedFormatted = `--- File: ${fileOrFolder.path} ---\n${truncatedContent}\n... [TRUNCATED]\n--- End File: ${fileOrFolder.path} ---\n\n`;
                                aggregatedContent += truncatedFormatted;
                                charCount = MAX_CONTEXT_CHARS; // Assume limit reached
                                includedFiles.push(fileOrFolder.path + " (truncated)");
                                warnings.push(`Content truncated for: ${fileOrFolder.path}`);
                             }
                            warnings.push(`Context limit reached. Could not fully include: ${fileOrFolder.path}`);
                            break; // Stop processing
                        }
                    } catch (error) {
                        warnings.push(`Error reading file: ${fileOrFolder.path}. ${error.message}`);
                    }
                } else {
                    warnings.push(`Skipping non-markdown file: ${fileOrFolder.path}`);
                }
            } else if (fileOrFolder instanceof TFolder) {
                const folderResult = await this.readFolderRecursively(fileOrFolder, charCount);
                if (charCount + folderResult.content.length <= MAX_CONTEXT_CHARS) {
                     aggregatedContent += folderResult.content;
                     charCount += folderResult.content.length;
                     includedFiles.push(...folderResult.filesRead);
                     warnings.push(...folderResult.folderWarnings);
                } else {
                    // Try adding truncated content if possible
                    const remainingChars = MAX_CONTEXT_CHARS - charCount;
                    if (remainingChars > 100 && folderResult.content.length > 0) {
                        const truncatedContent = folderResult.content.substring(0, remainingChars - 80); // Estimate header/footer size
                        aggregatedContent += truncatedContent + "\n... [FOLDER CONTENT TRUNCATED] ...\n";
                        charCount = MAX_CONTEXT_CHARS;
                        includedFiles.push(...folderResult.filesRead.map(f => f + " (potentially truncated)"));
                        warnings.push(`Content truncated for folder: ${fileOrFolder.path}`);
                    }
                    warnings.push(`Context limit reached during folder processing: ${fileOrFolder.path}`);
                    break; // Stop processing
                }

            }
        }

        return {
            contextString: aggregatedContent.trim(),
            includedFiles: includedFiles,
            warnings: warnings
        };
    }

    private async readFolderRecursively(folder: TFolder, currentChars: number): Promise<{ content: string, filesRead: string[], folderWarnings: string[] }> {
        let folderContent = '';
        const filesRead: string[] = [];
        const folderWarnings: string[] = [];
        let charCount = currentChars; // Track chars added within this folder context

        const children = folder.children.sort((a, b) => {
            const isAFolder = a instanceof TFolder;
            const isBFolder = b instanceof TFolder;
            if (isAFolder !== isBFolder) return isAFolder ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        for (const item of children) {
             if (charCount >= MAX_CONTEXT_CHARS) {
                folderWarnings.push(`Context limit reached within folder: ${folder.path}`);
                break;
            }

            if (item instanceof TFile && item.extension === 'md') {
                try {
                    const content = await this.vault.cachedRead(item);
                    const formattedFileContent = `--- File: ${item.path} ---\n${content}\n--- End File: ${item.path} ---\n\n`;
                     if (charCount + formattedFileContent.length <= MAX_CONTEXT_CHARS) {
                        folderContent += formattedFileContent;
                        charCount += formattedFileContent.length;
                        filesRead.push(item.path);
                    } else {
                        const remainingChars = MAX_CONTEXT_CHARS - charCount;
                         if (remainingChars > 100) {
                            const truncatedContent = content.substring(0, remainingChars - 80);
                            const truncatedFormatted = `--- File: ${item.path} ---\n${truncatedContent}\n... [TRUNCATED]\n--- End File: ${item.path} ---\n\n`;
                            folderContent += truncatedFormatted;
                            charCount = MAX_CONTEXT_CHARS;
                            filesRead.push(item.path + " (truncated)");
                            folderWarnings.push(`Content truncated for: ${item.path}`);
                         }
                        folderWarnings.push(`Context limit reached. Could not fully include: ${item.path}`);
                        break;
                    }
                } catch (error) {
                    folderWarnings.push(`Error reading file in folder ${folder.path}: ${item.path}. ${error.message}`);
                }
            } else if (item instanceof TFolder) {
                const subFolderResult = await this.readFolderRecursively(item, charCount);
                if (charCount + subFolderResult.content.length <= MAX_CONTEXT_CHARS) {
                    folderContent += subFolderResult.content;
                    charCount += subFolderResult.content.length;
                    filesRead.push(...subFolderResult.filesRead);
                    folderWarnings.push(...subFolderResult.folderWarnings);
                } else {
                     const remainingChars = MAX_CONTEXT_CHARS - charCount;
                     if (remainingChars > 100 && subFolderResult.content.length > 0) {
                         const truncatedContent = subFolderResult.content.substring(0, remainingChars - 80); // Estimate header/footer size
                         folderContent += truncatedContent + "\n... [SUBFOLDER CONTENT TRUNCATED] ...\n";
                         charCount = MAX_CONTEXT_CHARS;
                         filesRead.push(...subFolderResult.filesRead.map(f => f + " (potentially truncated)"));
                         folderWarnings.push(`Content truncated for subfolder: ${item.path}`);
                     }
                    folderWarnings.push(`Context limit reached during subfolder processing: ${item.path}`);
                    break;
                }
            }
        }
        return { content: folderContent, filesRead, folderWarnings };
    }
}

