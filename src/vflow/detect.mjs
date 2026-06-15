#!/usr/bin/env node
// vflow global session detector (installed to ~/.claude/vflow/detect.mjs by vflow setup,
// called from user-level settings.json hooks across all projects).
//
// Behavior:
//   Project has vflow (.vflow/ exists) -> delegate to project's inject script
//   Not enabled + not declined + session mode -> inject "ask user to enable" guidance
//   Declined -> silent
// Any error exits silently, never blocks a session.

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { execFileSync } from "child_process";
import { homedir } from "os";

const STATE_DIR = join(homedir(), ".claude", "vflow");

const SUGGEST = `<vflow-suggest>
\u68c0\u6d4b\u5230\u5f53\u524d\u9879\u76ee\u5c1a\u672a\u542f\u7528 vflow \u5de5\u4f5c\u6d41\uff08\u4efb\u52a1\u5206\u7ea7+\u6863\u6848\u7559\u75d5+\u89c4\u8303\u9a71\u52a8+\u6d4b\u8bd5\u786c\u89c4\u5219\uff09\u3002
\u6536\u5230\u7528\u6237\u7b2c\u4e00\u6761\u6d88\u606f\u65f6\uff0c\u5148\u7528 AskUserQuestion \u5de5\u5177\u8be2\u95ee\uff08\u4ec5\u95ee\u4e00\u6b21\uff09\uff1a
  \u95ee\u9898\uff1a\u201c\u662f\u5426\u4e3a\u672c\u9879\u76ee\u542f\u7528 vflow \u5de5\u4f5c\u6d41\uff1f\u201d
  \u9009\u9879\uff1a\u542f\u7528\uff08\u63a8\u8350\uff09/ \u672c\u9879\u76ee\u4e0d\u542f\u7528
\u5f97\u5230\u7b54\u6848\u540e\u518d\u5904\u7406\u7528\u6237\u7684\u6d88\u606f\u3002
- \u9009\u542f\u7528 \u2192 \u6267\u884c \`vflow init . --yes\`\uff08\u9759\u9ed8\u9ed8\u8ba4\u914d\u7f6e\uff09\uff0c\u5b8c\u6210\u540e\u5efa\u8bae\u8fd0\u884c /vflow:init \u8ba9 AI \u63a2\u6d4b\u9879\u76ee\u914d\u7f6e
- \u9009\u4e0d\u542f\u7528 \u2192 \u6267\u884c \`vflow decline .\`\uff08\u8bb0\u5f55\u540e\u4e0d\u518d\u8be2\u95ee\uff1b\u5c06\u6765\u60f3\u542f\u7528\u8bf4\u4e00\u58f0\u201c\u542f\u7528 vflow\u201d\u5373\u53ef\uff09
- \u7528\u6237\u5173\u95ed\u9009\u62e9\u6846\u672a\u8868\u6001 \u2192 \u76f4\u63a5\u5904\u7406\u5176\u6d88\u606f\uff0c\u672c\u4f1a\u8bdd\u4e0d\u518d\u63d0\u53ca
</vflow-suggest>`;

function declined(cwd) {
  try {
    const data = JSON.parse(readFileSync(join(STATE_DIR, "declined.json"), "utf-8"));
    return data.includes(resolve(cwd));
  } catch {
    return false;
  }
}

function projectHasHooks(cwd) {
  try {
    const content = readFileSync(join(cwd, ".claude", "settings.json"), "utf-8");
    return content.includes(".vflow/scripts/inject.py") || content.includes(".vflow/scripts/inject.mjs");
  } catch {
    return false;
  }
}

function main() {
  const mode = process.argv[2] || "prompt";
  // Session shell may cd into subdirs; prefer CLAUDE_PROJECT_DIR over cwd
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Prefer inject.mjs, fall back to inject.py
  const injMjs = join(cwd, ".vflow", "scripts", "inject.mjs");
  const injPy = join(cwd, ".vflow", "scripts", "inject.py");
  const inj = existsSync(injMjs) ? injMjs : existsSync(injPy) ? injPy : null;

  if (inj) {
    // Project has its own hooks -> silent to avoid double injection
    if (projectHasHooks(cwd)) return 0;
    // Determine how to run the inject script
    const isNode = inj.endsWith(".mjs") || inj.endsWith(".js");
    const exe = isNode ? process.execPath : "python";
    try {
      const stdout = execFileSync(exe, [inj, mode], {
        encoding: "utf-8",
        timeout: 15000,
      });
      if (stdout) process.stdout.write(stdout);
    } catch {
      // silent
    }
  } else if (mode === "session" && !declined(cwd)) {
    process.stdout.write(SUGGEST + "\n");
  }
  return 0;
}

try {
  process.exit(main());
} catch {
  process.exit(0);
}
