// ralph-store.ts — Read/write steps in task.json, manage active_step_index.
import { readFileSync, writeFileSync, existsSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { TASKS } from './config.js';
import { pointerPath } from './team.js';
import { readSessionBinding, resolveCliTaskSlug } from './session.js';
// -- Task directory resolution --
export function currentTaskDir(sessionKey) {
    let name = null;
    if (sessionKey) {
        name = readSessionBinding(sessionKey);
    }
    if (!name) {
        const ptr = pointerPath();
        if (!existsSync(ptr))
            return null;
        name = readFileSync(ptr, 'utf-8').trim();
    }
    if (!name)
        return null;
    const d = join(TASKS, name);
    try {
        if (statSync(d).isDirectory())
            return d;
    }
    catch { /* */ }
    return null;
}
// Resolve a task directory for a ralph subcommand: explicit slug wins, else
// resolve via the session bridge (concurrent terminals stay isolated), falling
// back to the legacy pointer.
export function resolveStepTaskDir(explicitSlug) {
    if (explicitSlug) {
        const d = join(TASKS, explicitSlug);
        try {
            if (statSync(d).isDirectory())
                return d;
        }
        catch { /* */ }
        return null;
    }
    const { slug } = resolveCliTaskSlug(() => {
        const ptr = pointerPath();
        if (!existsSync(ptr))
            return null;
        return readFileSync(ptr, 'utf-8').trim() || null;
    });
    if (!slug)
        return null;
    const d = join(TASKS, slug);
    try {
        if (statSync(d).isDirectory())
            return d;
    }
    catch { /* */ }
    return null;
}
// -- Read/Write task.json --
export function readTaskJson(taskDir) {
    const path = join(taskDir, 'task.json');
    return JSON.parse(readFileSync(path, 'utf-8'));
}
export function writeTaskJson(taskDir, data) {
    const path = join(taskDir, 'task.json');
    // Atomic write: write to tmp then rename
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    renameSync(tmp, path);
}
// -- Steps accessors --
export function getSteps(taskDir) {
    const task = readTaskJson(taskDir);
    return task.steps ?? [];
}
export function getActiveStepIndex(taskDir) {
    const task = readTaskJson(taskDir);
    return task.active_step_index ?? null;
}
export function hasRalphSession(taskDir) {
    const task = readTaskJson(taskDir);
    return Array.isArray(task.steps) && task.steps.length > 0;
}
// -- Find next pending step --
export function findNextPendingStep(steps) {
    return steps.find(s => s.status === 'pending') ?? null;
}
// -- Update a single step and write back --
export function updateStep(taskDir, index, updater) {
    const task = readTaskJson(taskDir);
    if (!task.steps || index < 0 || index >= task.steps.length) {
        throw new Error(`Step index ${index} out of range`);
    }
    updater(task.steps[index]);
    writeTaskJson(taskDir, task);
}
// -- Set/clear active_step_index --
export function setActiveStep(taskDir, index) {
    const task = readTaskJson(taskDir);
    task.active_step_index = index;
    writeTaskJson(taskDir, task);
}
export function clearActiveStep(taskDir) {
    const task = readTaskJson(taskDir);
    task.active_step_index = null;
    writeTaskJson(taskDir, task);
}
// -- Write steps array to task.json --
export function writeSteps(taskDir, steps) {
    const task = readTaskJson(taskDir);
    task.steps = steps;
    task.active_step_index = null;
    task.ralph_protocol_version = '1';
    writeTaskJson(taskDir, task);
}
// -- Summary for inject.ts --
export function stepsSummary(taskDir) {
    const task = readTaskJson(taskDir);
    if (!task.steps || task.steps.length === 0)
        return null;
    const total = task.steps.length;
    const completed = task.steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
    const active = task.active_step_index;
    const activeStep = active !== null && active !== undefined ? task.steps[active] : null;
    let summary = `Ralph session: ${completed}/${total} steps completed.`;
    if (activeStep) {
        summary += ` Current: step [${active}] ${activeStep.skill} (${activeStep.status}).`;
    }
    else {
        const next = task.steps.find(s => s.status === 'pending');
        if (next) {
            summary += ` Next: step [${next.index}] ${next.skill}.`;
        }
        else {
            summary += ' All steps done.';
        }
    }
    return summary;
}
