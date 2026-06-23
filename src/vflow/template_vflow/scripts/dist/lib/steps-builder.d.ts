import { type RalphStep } from './ralph-schema.js';
interface GraphNode {
    type: 'command' | 'gate' | 'decision' | 'terminal';
    cmd?: string;
    description?: string;
    next?: string;
    skill_ref?: string;
    required_reading?: string[];
    completion_checks?: string[];
    on_pass?: string;
    on_fail?: string;
    wait?: boolean;
    wait_message?: string;
    edges?: Array<{
        value?: string;
        default?: boolean;
        target: string;
    }>;
}
interface GraphDef {
    id: string;
    entry: string;
    nodes: Record<string, GraphNode>;
}
/**
 * Load a graph definition file.
 */
export declare function loadGraph(graphId: string): GraphDef;
/**
 * Build a linear steps array by traversing the graph from entry.
 *
 * Strategy:
 * - command nodes → step with skill_ref
 * - gate nodes → step with node_type='gate' (will pause for user confirmation)
 * - decision nodes → follow the default edge (runtime decision handled by checker)
 * - terminal nodes → stop traversal
 *
 * @param tier - T1 tasks skip gate nodes for lighter flow
 */
export declare function buildSteps(graphId: string, tier?: string): RalphStep[];
/**
 * Build steps for a T1 quick task (minimal sequence).
 */
export declare function buildT1Steps(): RalphStep[];
export {};
