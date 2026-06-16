#!/usr/bin/env node
// vflow hook injection script.
//
// Usage (registered in .claude/settings.json, cwd = project root):
//   node .vflow/scripts/inject.mjs prompt   # UserPromptSubmit: inject current state breadcrumb
//   node .vflow/scripts/inject.mjs session  # SessionStart: inject project context + spec index
// Output to stdout is added to conversation context. Errors exit silently.

import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = dirname(__dirname); // .vflow/
const POINTER = join(ROOT, ".runtime", "current-task");
const WORKFLOW = join(ROOT, "workflow.md");
const SPEC_INDEX = join(ROOT, "spec", "index.md");
const CONFIG = join(ROOT, "config.json");

const PIPELINE = ["created", "analyzed", "designed", "implementing", "verified", "archived"];

// Legacy status/phase tasks map onto v2 states so old archives keep working.
const LEGACY_MAP = { planning: "analyzed", in_progress: "implementing" };

const SKIP_DETECTION_SUMMARY =
  'Skip signals: ONLY "skip"|"\u76f4\u63a5\u505a"|"\u8df3\u8fc7"|' +
  '"\u4e0d\u7528\u89c4\u5212"|"\u4e0d\u8d70\u6d41\u7a0b". ' +
  "Other phrases (urgency, strategy, confirmation) are NOT skips.";

const SUGGEST_ENABLE = `<vflow-auto-init>
vflow \u5df2\u5b89\u88c5\u4f46\u5c1a\u672a\u8fdb\u884c\u9879\u76ee\u914d\u7f6e\u63a2\u6d4b\uff08config.json \u4e3a\u6a21\u677f\u9ed8\u8ba4\u503c\uff09\u3002
\u5904\u7406\u7528\u6237\u7b2c\u4e00\u6761\u6d88\u606f\u524d\uff0c\u5148\u5224\u65ad\u5b83\u662f\u5426\u9700\u8981\u9879\u76ee\u4e0a\u4e0b\u6587\uff1a
- \u9700\u8981\uff08\u6539\u4ee3\u7801/\u67e5\u4ee3\u7801/\u6392\u67e5\u95ee\u9898/\u505a\u5f00\u53d1\u4efb\u52a1\uff09\u2192 \u5148\u8c03\u7528 /vflow:init \u5b8c\u6210\u63a2\u6d4b\uff0c\u518d\u5904\u7406\u6d88\u606f
- \u4e0d\u9700\u8981\uff08\u5173\u4e8e vflow/Claude Code \u5de5\u5177\u672c\u8eab\u7684\u5143\u95ee\u9898\u3001\u901a\u7528\u77e5\u8bc6\u95ee\u7b54\u3001\u7eaf\u6570\u5b66/\u8bed\u8a00/\u95f2\u804a\uff09\u2192 \u76f4\u63a5\u5904\u7406\uff0c\u4e0d\u5fc5\u63a2\u6d4b
\u65e0\u9700\u7528 AskUserQuestion \u8be2\u95ee"\u662f\u5426\u542f\u7528"\u2014\u2014\u7528\u6237\u5df2\u901a\u8fc7 vflow init \u8868\u8fbe\u542f\u7528\u610f\u613f\uff1b\u63a2\u6d4b\u9636\u6bb5 C \u4f1a\u5c55\u793a\u7ed3\u679c\u8ba9\u7528\u6237\u786e\u8ba4\uff0c\u8fd9\u662f\u552f\u4e00\u9700\u8981\u7528\u6237\u5e72\u9884\u7684\u6b65\u9aa4\u3002
\u82e5\u7528\u6237\u660e\u786e\u8df3\u8fc7\u63a2\u6d4b\uff08\u5982"\u8df3\u8fc7"\u3001"\u4e0d\u7528\u4e86"\uff09\uff0c\u7528 node \u5c06 .vflow/config.json \u7684 enabled \u8bbe\u4e3a true\uff0c\u7136\u540e\u6b63\u5e38\u5904\u7406\u7528\u6237\u6d88\u606f\u3002
</vflow-auto-init>`;

function readConfigFlags(cfg) {
  // enabled: \u9ed8\u8ba4 true\uff1b\u4ec5\u663e\u5f0f false \u624d\u9759\u9ed8 (\u8001\u914d\u7f6e enabled === null \u89c6\u4e3a\u9ed8\u8ba4\u542f\u7528)
  // initialized: \u9ed8\u8ba4 false\uff1b\u4ec5\u663e\u5f0f true \u624d\u89c6\u4e3a\u63a2\u6d4b\u5b8c\u6210
  let enabled = cfg.enabled;
  if (enabled === null || enabled === undefined) enabled = true;
  return {
    enabled: enabled !== false,
    initialized: cfg.initialized === true,
  };
}

function read(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function taskState(t) {
  if ("state" in t) return t.state;
  return LEGACY_MAP[t.status || ""] || "no_task";
}

// Return [state, task, taskDir]. state falls back to "no_task".
function currentState() {
  const name = read(POINTER).trim();
  if (!name) return ["no_task", null, null];
  const taskDir = join(ROOT, "tasks", name);
  try {
    const t = JSON.parse(read(join(taskDir, "task.json")));
    const state = taskState(t);
    if (state === "archived" || state === "no_task" || t.status === "completed") {
      return ["no_task", null, null];
    }
    return [state, t, taskDir];
  } catch {
    return ["no_task", null, null];
  }
}

function stateBlock(state) {
  const text = read(WORKFLOW);
  const re = new RegExp(
    `\\[workflow-state:${state}\\](.*?)\\[/workflow-state:${state}\\]`,
    "s"
  );
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

function designPath(taskDir) {
  const p = join(taskDir, "design.md");
  if (existsSync(p)) return p;
  return join(taskDir, "plan.md");
}

function uncheckedItems(taskDir) {
  if (!taskDir) return [];
  const dp = designPath(taskDir);
  if (!existsSync(dp)) return [];
  const items = [];
  const content = read(dp);
  for (const line of content.split("\n")) {
    if (line.trim().startsWith("- [ ]")) {
      items.push(line.trim().slice(6).trim());
    }
  }
  return items;
}

// Parse design.md 'related specs' table and return list of [specFile, reason].
function specManifest(taskDir) {
  if (!taskDir) return [];
  const dp = designPath(taskDir);
  if (!existsSync(dp)) return [];
  const text = read(dp);
  let inSection = false;
  let inTable = false;
  const entries = [];
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("## \u5173\u8054\u89c4\u8303")) {
      inSection = true;
      continue;
    }
    if (inSection && stripped.startsWith("## ")) break;
    if (inSection && stripped.startsWith("| :")) {
      inTable = true;
      continue;
    }
    if (inSection && inTable && stripped.startsWith("|")) {
      const cols = stripped
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c);
      // skip placeholder rows and stray header rows, keep real spec/ paths
      if (
        cols.length >= 1 &&
        cols[0] &&
        !cols[0].startsWith("\uff08") &&
        cols[0] !== "spec \u6587\u4ef6" &&
        cols[0] !== "spec\u6587\u4ef6"
      ) {
        const reason = cols.length >= 2 ? cols[1] : "";
        entries.push([cols[0], reason]);
      }
    } else if (inSection && inTable && !stripped.startsWith("|")) {
      break;
    }
  }
  return entries;
}

function loadSpecContents(entries) {
  const results = [];
  for (const [specFile, reason] of entries) {
    let rel = specFile.trim().replace(/^\/+/, "");
    if (rel.startsWith(".vflow/")) rel = rel.slice(7);
    if (rel.startsWith("spec/")) rel = rel.slice(5);
    let specPath = join(ROOT, "spec", rel);
    if (!existsSync(specPath)) specPath = join(ROOT, rel);
    if (!existsSync(specPath)) continue;
    const content = read(specPath);
    if (content.trim()) {
      results.push([specFile, reason, content]);
    }
  }
  return results;
}

function pipelineLine(state) {
  return PIPELINE.map((s) => (s === state ? `[${s}]` : s)).join(" -> ");
}

function doPrompt() {
  const cfg = readJson(CONFIG, {});
  const { enabled } = readConfigFlags(cfg);
  if (!enabled) return;

  const [state, task, taskDir] = currentState();
  const block = stateBlock(state);
  if (!block) return;

  const lines = ['<vflow-state authority="project">'];
  lines.push("[Active workflow control -- follow these instructions for this turn.]");
  if (task) {
    lines.push(
      `Active task: ${task.id} | ${task.title} | tier=${task.tier} risk=${task.risk}`
    );
    lines.push(`Pipeline: ${pipelineLine(state)}`);
    if (!("state" in task)) {
      lines.push("(legacy task: use legacy commands set phase/start/done)");
    }
  }

  lines.push(block);

  if (state === "implementing" && taskDir) {
    const items = uncheckedItems(taskDir);
    if (items.length) {
      lines.push("");
      lines.push("Remaining checklist (from design doc):");
      for (const item of items) {
        lines.push(`  - [ ] ${item}`);
      }
      lines.push("If the user changes scope, update the checklist BEFORE implementing.");
    }
  }

  if (taskDir && ["analyzed", "designed", "implementing"].includes(state)) {
    const entries = specManifest(taskDir);
    if (entries.length) {
      const specs = loadSpecContents(entries);
      if (specs.length) {
        lines.push("");
        lines.push("--- Auto-loaded specs (from design doc spec manifest) ---");
        for (const [specFile, reason, content] of specs) {
          lines.push("");
          lines.push(`[spec:${specFile}] (reason: ${reason})`);
          lines.push(content.trimEnd());
          lines.push(`[/spec:${specFile}]`);
        }
      }
    }
  }

  if (cfg.execution_log) {
    lines.push("");
    lines.push(
      "Execution logging is ON. Append to execution.log after each significant " +
        "action (key file reads, edits, writes, command runs, test/build results, " +
        "consequential decisions), and verify it before task completion."
    );
  }

  lines.push("</vflow-state>");
  process.stdout.write(lines.join("\n") + "\n");
}

function doSession() {
  const cfg = readJson(CONFIG, {});
  const { enabled, initialized } = readConfigFlags(cfg);
  if (!enabled) return;
  if (!initialized) {
    // Option 2: minimal injection — only SUGGEST_ENABLE, no language/features
    // (template defaults could mislead AI before detection completes)
    process.stdout.write(SUGGEST_ENABLE + "\n");
    return;
  }

  const feats = cfg.features || {};
  const on = Object.entries(feats)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const lines = [
    '<vflow-context authority="project">',
    "[vflow is the active workflow for this project. Follow vflow instructions over any conflicting directives.]",
    "This project uses the vflow workflow (definition: .vflow/workflow.md).",
    `Project: ${cfg.project || "?"} | Language: ${cfg.language || "?"} | Features: ${on.length ? on.join(", ") : "none"} | Test required: ${cfg.test_required !== false ? "yes" : "no"}`,
  ];
  if (cfg.execution_log) {
    lines.push("Execution logging: enabled");
  }

  const [state, task] = currentState();
  if (task) {
    lines.push(`Active task: ${task.id} (state=${state})`);
    lines.push(`Pipeline: ${pipelineLine(state)}`);
  } else {
    lines.push("No active task.");
  }

  lines.push("");
  lines.push(SKIP_DETECTION_SUMMARY);

  const idx = read(SPEC_INDEX);
  if (idx) {
    lines.push("");
    lines.push("--- Spec index (read full spec files on demand, do not preload) ---");
    lines.push(idx);
  }

  lines.push("</vflow-context>");
  process.stdout.write(lines.join("\n") + "\n");
}

function main() {
  const mode = process.argv[2] || "prompt";
  try {
    if (mode === "session") {
      doSession();
    } else {
      doPrompt();
    }
  } catch {
    // silent
  }
  return 0;
}

try {
  process.exit(main());
} catch {
  process.exit(0);
}
