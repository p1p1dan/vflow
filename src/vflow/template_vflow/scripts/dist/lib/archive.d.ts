import type { TaskJson, FollowupTask } from './config.js';
export declare function moveDir(src: string, dst: string): void;
export declare function gitHead(): string;
export declare function appendJournal(task: TaskJson, summary: string): void;
export declare function extractFollowupTasks(designText: string): FollowupTask[];
export declare function archiveMove(taskDir: string, task: TaskJson, summary: string): void;
