import type { TaskJson } from './config.js';
export interface GroupJson {
    id: string;
    title: string;
    created: string;
    status: 'planning' | 'executing' | 'completed';
    subtasks: SubTaskRef[];
    waves?: WaveDefinition[];
    shared_context?: Record<string, unknown>;
}
export interface SubTaskRef {
    id: string;
    slug: string;
    depends_on?: string[];
    wave?: number;
    status: string;
}
export interface WaveDefinition {
    id: number;
    name?: string;
    parallel: boolean;
    tasks: string[];
}
export declare function createGroup(slug: string, title: string): GroupJson;
export declare function createSubTask(groupSlug: string, subSlug: string, title: string, opts?: {
    depends_on?: string[];
    wave?: number;
}): TaskJson;
export declare function groupStatus(groupSlug: string): GroupJson | null;
export declare function groupDone(groupSlug: string, summary: string): void;
