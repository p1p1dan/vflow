// steps-builder.ts — Generate linear steps[] from a graph JSON definition.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GRAPHS_DIR } from './config.js';
import { createStep } from './ralph-schema.js';
/**
 * Load a graph definition file.
 */
export function loadGraph(graphId) {
    const path = join(GRAPHS_DIR, `${graphId}.json`);
    if (!existsSync(path)) {
        throw new Error(`Graph not found: ${path}`);
    }
    return JSON.parse(readFileSync(path, 'utf-8'));
}
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
export function buildSteps(graphId, tier = 'T2') {
    const graph = loadGraph(graphId);
    const steps = [];
    const visited = new Set();
    let current = graph.entry;
    let index = 0;
    while (current && !visited.has(current)) {
        visited.add(current);
        const node = graph.nodes[current];
        if (!node)
            break;
        switch (node.type) {
            case 'command': {
                steps.push(createStep(index++, current, 'command', node.skill_ref || node.cmd || current, node.description || '', node.required_reading || [], node.completion_checks || []));
                current = node.next;
                break;
            }
            case 'gate': {
                // T1 tasks skip gates (autonomous execution)
                if (tier === 'T1') {
                    current = node.on_pass;
                    break;
                }
                steps.push(createStep(index++, current, 'gate', `gate:${current}`, node.wait_message || `Gate: ${current}`, [], []));
                // After gate, continue to on_pass (the normal path)
                current = node.on_pass;
                break;
            }
            case 'decision': {
                // Follow the default edge for linear traversal.
                // Decision logic is handled at runtime by the step checker.
                const defaultEdge = node.edges?.find((e) => e.default);
                current = defaultEdge?.target;
                break;
            }
            case 'terminal': {
                // End of graph — no step generated
                current = undefined;
                break;
            }
            default:
                current = undefined;
        }
    }
    return steps;
}
/**
 * Build steps for a T1 quick task (minimal sequence).
 */
export function buildT1Steps() {
    return [
        createStep(0, 'implement', 'command', 'vflow-quick', 'Quick implementation', [], ['has_changes']),
        createStep(1, 'verify', 'command', 'vflow-verify', 'Quick verification', [], []),
    ];
}
