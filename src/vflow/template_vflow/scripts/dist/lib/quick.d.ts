export interface QuickLogEntry {
    id: string;
    title: string;
    files_changed: string[];
    commit: string;
    timestamp: string;
}
export declare function appendQuickLog(title: string, filesChanged?: string[]): QuickLogEntry;
export declare function getQuickLogPath(): string;
