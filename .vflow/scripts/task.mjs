#!/usr/bin/env node
// vflow task state management (sole state writer).
//
// v2 pipeline: created -> analyzed -> designed -> implementing -> verified -> archived
// Every transition has mechanical exit-condition checks (R-ID trace chain,
// checklist completion, machine-executed tests). Bypasses are recorded.
//
// Usage:
//   node .vflow/scripts/task.mjs create <slug> --title "title" [--tier T2]
//   node .vflow/scripts/task.mjs advance [--skip-check]
//   node .vflow/scripts/task.mjs back
//   node .vflow/scripts/task.mjs set risk {low|high}
//   node .vflow/scripts/task.mjs done --summary "..." [--force]
//   node .vflow/scripts/task.mjs status
//
// Legacy tasks (status/phase fields, plan.md) are auto-mapped and archived
// via the legacy validation path; they are not blocked.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, unlinkSync, renameSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = dirname(__dirname); // .vflow/
const TASKS = join(ROOT, "tasks");
const RUNTIME = join(ROOT, ".runtime");
const POINTER = join(RUNTIME, "current-task");
const JOURNAL_DIR = join(ROOT, "journal");
const CONFIG = join(ROOT, "config.json");

const STATES = ["created", "analyzed", "designed", "implementing", "verified", "archived"];

const TEST_OUTPUT_TAIL = 3000;
const TEST_TIMEOUT = 600;

const MACHINE_BLOCK_HEADER = "## 机器执行记录（task.py 写入，请勿手改）";

// -- helpers --

function readJson(path, defaultVal = null) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return defaultVal;
  }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function readText(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

// Local ISO timestamp truncated to seconds, matching Python isoformat(timespec="seconds")
function isoNow() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  const base = local.toISOString().replace(/\.\d{3}Z$/, "");
  // no timezone suffix — matches Python's naive datetime.now().isoformat(timespec="seconds")
  return base;
}

// ISO date only (YYYY-MM-DD)
function isoToday() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

// MM-DD prefix for task names
function monthDay() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

// YYYY-MM for archive directory
function yearMonth() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

// Cross-device move: try rename, fallback to recursive copy + remove
function moveDir(src, dst) {
  try {
    renameSync(src, dst);
  } catch {
    copyDirRecursive(src, dst);
    rmSync(src, { recursive: true, force: true });
  }
}

function copyDirRecursive(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

// -- core helpers --

function currentTaskDir() {
  if (!existsSync(POINTER)) return null;
  const name = readText(POINTER).trim();
  const d = join(TASKS, name);
  try {
    if (statSync(d).isDirectory()) return d;
  } catch { /* */ }
  return null;
}

function taskState(t) {
  if ("state" in t) return t.state;
  const status = t.status || "";
  if (status === "planning") return "analyzed";
  if (status === "in_progress") return "implementing";
  if (status === "completed") return "archived";
  return "created";
}

function isLegacy(t) {
  return !("state" in t);
}

function designPath(taskDir) {
  const p = join(taskDir, "design.md");
  if (existsSync(p)) return p;
  return join(taskDir, "plan.md");
}

// -- R-ID trace chain (R3) --

const RID_DEF = /^\s*-\s*(R\d+)\s*[:：][ \t]*\S/gm;
const RID_REF = /[（(](R\d+(?:\s*[,，、]\s*R\d+)*)[)）]/g;

function parseRidDefinitions(text) {
  const rids = new Set();
  let m;
  const re = new RegExp(RID_DEF.source, RID_DEF.flags);
  while ((m = re.exec(text)) !== null) {
    rids.add(m[1]);
  }
  return rids;
}

function parseRidReferences(text) {
  const rids = new Set();
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!(s.startsWith("- [ ]") || s.startsWith("- [x]") || s.startsWith("- [X]"))) continue;
    const re = new RegExp(RID_REF.source, RID_REF.flags);
    let m;
    while ((m = re.exec(s)) !== null) {
      for (const rid of m[1].split(/[,，、]/)) {
        rids.add(rid.trim());
      }
    }
  }
  return rids;
}

function checkRidCoverage(required, covered, docName) {
  const missing = [...setDiff(required, covered)].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const extra = [...setDiff(covered, required)].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const msgs = [];
  for (const rid of missing) msgs.push(`missing ${rid} in ${docName}`);
  for (const rid of extra) msgs.push(`warning: ${rid} in ${docName} is not defined in requirement.md`);
  return [missing.length === 0, msgs];
}

function setDiff(a, b) {
  const result = new Set();
  for (const x of a) if (!b.has(x)) result.add(x);
  return result;
}

function verifySection(text, sectionNo) {
  // Python: re.M|re.S with \Z; JS has no \Z, use $(?![\s\S]) for end-of-string
  const pattern = new RegExp(`^##\\s*§${sectionNo}\\b.*?$(.*?)(?=^##\\s|$(?![\\s\\S]))`, "ms");
  const m = pattern.exec(text);
  return m ? m[1] : "";
}

// -- document checks --

function isFilled(path) {
  if (!existsSync(path)) return false;
  const content = readText(path);
  if (!content.trim()) return false;
  const hashFile = path + ".hash";
  if (existsSync(hashFile)) {
    const originalHash = readText(hashFile).trim();
    const currentHash = createHash("sha256").update(content, "utf-8").digest("hex").slice(0, 16);
    return currentHash !== originalHash;
  }
  const nonEmpty = content.split("\n").filter((l) => {
    const s = l.trim();
    return s && !s.startsWith("#") && !s.startsWith("<!--") && !s.startsWith("|") && !s.startsWith("---") && !s.startsWith(">") && !s.startsWith("- [ ]");
  });
  const meaningful = nonEmpty.filter((l) => !/^-\s*\S+：\s*$/.test(l.trim()));
  return meaningful.length >= 3;
}

function uncheckedItems(taskDir) {
  const text = readText(designPath(taskDir));
  return text.split("\n")
    .filter((l) => l.trim().startsWith("- [ ]"))
    .map((l) => l.trim().slice(6).trim());
}

function worklogFiles(taskDir) {
  const text = readText(join(taskDir, "worklog.md"));
  const files = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("|") || s.startsWith("| :") || s.startsWith("|:")) continue;
    const cols = s.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cols.length >= 2 && cols[1] && !["File", "文件", "----"].includes(cols[1])) {
      files.push(cols[1].replace(/^`|`$/g, ""));
    }
  }
  return files;
}

function latestWorklogMtime(taskDir, projectRoot) {
  let latest = 0;
  for (const rel of worklogFiles(taskDir)) {
    const p = join(projectRoot, rel);
    try {
      const st = statSync(p);
      if (st.isFile()) {
        latest = Math.max(latest, st.mtimeMs / 1000);
      }
    } catch {
      console.log(`  [vflow] warning: worklog file not found, mtime check skipped: ${rel}`);
    }
  }
  return latest;
}

// -- machine-executed verification (R4) --

function runVerification(taskDir, cfg, task) {
  const cmd = task.test_scope || ((cfg.build || {}).test_command || "");
  const testRequired = cfg.test_required !== undefined ? cfg.test_required : true;
  if (!cmd) {
    if (testRequired) {
      return [false, "config.build.test_command is empty but test_required=true. Configure a test command (or set test_required=false) first."];
    }
    return [true, "test_required=false and no test_command; verification skipped"];
  }

  // shell=true: uses cmd.exe on Windows, /bin/sh on Unix (matches Python shell=True)
  const result = spawnSync(cmd, [], {
    shell: true,
    cwd: dirname(ROOT),
    encoding: "utf-8",
    timeout: TEST_TIMEOUT * 1000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error && result.error.code === "ETIMEDOUT") {
    return [false, `test command timed out after ${TEST_TIMEOUT}s: ${cmd}`];
  }

  const stamp = isoNow();
  const combined = ((result.stdout || "") + (result.stderr || ""));
  const output = combined.slice(-TEST_OUTPUT_TAIL);
  const block = [
    "", MACHINE_BLOCK_HEADER,
    `- 命令: \`${cmd}\``,
    `- 时间: ${stamp}`,
    `- 退出码: ${result.status}`,
    "```", output.trim(), "```", "",
  ].join("\n");

  const vp = join(taskDir, "verify.md");
  try {
    const existing = readText(vp);
    writeFileSync(vp, existing + block, "utf-8");
  } catch {
    writeFileSync(vp, block, "utf-8");
  }

  if (result.status !== 0) {
    return [false, `test command failed (exit ${result.status}). Output appended to verify.md; fix the failures and advance again.`];
  }
  task.verified_at = stamp;
  return [true, "tests passed; machine record appended to verify.md"];
}

// -- transition checks --

function checkAnalyzed(taskDir, _cfg, _task) {
  const req = join(taskDir, "requirement.md");
  const errors = [];
  if (!isFilled(req)) {
    errors.push("requirement.md is not filled (still template or missing)");
  } else if (parseRidDefinitions(readText(req)).size === 0) {
    errors.push("requirement.md defines no R-ID entries (need lines like '- R1: ...')");
  }
  return errors;
}

function checkDesigned(taskDir, _cfg, _task) {
  const dp = designPath(taskDir);
  const errors = [];
  if (!isFilled(dp)) {
    errors.push(`${basename(dp)} is not filled (still template or missing)`);
    return errors;
  }
  const required = parseRidDefinitions(readText(join(taskDir, "requirement.md")));
  const covered = parseRidReferences(readText(dp));
  const [ok, msgs] = checkRidCoverage(required, covered, basename(dp));
  for (const m of msgs) {
    if (m.startsWith("warning:")) {
      console.log(`  [vflow] ${m}`);
    } else {
      errors.push(m + " (checklist items must carry trailing '(R<n>)' tags)");
    }
  }
  return errors;
}

function checkImplementing(_taskDir, _cfg, _task) {
  return [];
}

function checkVerified(taskDir, cfg, task) {
  const errors = [];
  const items = uncheckedItems(taskDir);
  if (items.length) {
    errors.push(`${items.length} unchecked items in ${basename(designPath(taskDir))}:`);
    for (const item of items) errors.push(`  - [ ] ${item}`);
    return errors;
  }
  const [ok, msg] = runVerification(taskDir, cfg, task);
  console.log(`  [vflow] ${msg}`);
  if (!ok) errors.push(msg);
  return errors;
}

function checkArchived(taskDir, cfg, task) {
  const errors = [];
  const vp = join(taskDir, "verify.md");
  if (!isFilled(vp)) {
    errors.push("verify.md is not filled");
    return errors;
  }
  const vtext = readText(vp);
  const required = parseRidDefinitions(readText(join(taskDir, "requirement.md")));
  const sec1 = verifySection(vtext, 1);
  if (!sec1.trim()) {
    errors.push("verify.md is missing section '## §1 ...' with per-R-ID results");
    return errors;
  }
  const closed = parseRidDefinitions(sec1);
  const [ok, msgs] = checkRidCoverage(required, closed, "verify.md");
  for (const m of msgs) {
    if (m.startsWith("warning:")) {
      console.log(`  [vflow] ${m}`);
    } else {
      errors.push(m + " (each R-ID needs a result entry '- R<n>: ...')");
    }
  }
  // mtime cross-check (R5): code must not change after machine verification
  const verifiedAt = task.verified_at || "";
  if (verifiedAt) {
    const vts = new Date(verifiedAt).getTime() / 1000 + 1.0;
    const latest = latestWorklogMtime(taskDir, dirname(ROOT));
    if (latest > vts) {
      const d = new Date(latest * 1000);
      const off = d.getTimezoneOffset();
      const local = new Date(d.getTime() - off * 60000);
      const latestIso = local.toISOString().replace(/\.\d{3}Z$/, "");
      errors.push(`source files changed after verification (${latestIso}). Run 'task.py back' then 'task.py advance' to re-verify.`);
    }
  } else {
    const testRequired = cfg.test_required !== undefined ? cfg.test_required : true;
    if (testRequired) {
      errors.push("no machine verification record (verified_at missing); run 'task.py back' then 'task.py advance' to verify with tests");
    }
  }
  return errors;
}

const TRANSITION_CHECKS = {
  analyzed: checkAnalyzed,
  designed: checkDesigned,
  implementing: checkImplementing,
  verified: checkVerified,
  archived: checkArchived,
};

// -- commands --

function cmdCreate(args) {
  const name = `${monthDay()}-${args.slug}`;
  const d = join(TASKS, name);
  if (existsSync(d)) {
    console.log(`[vflow] Task already exists: ${name}`);
    return 1;
  }
  mkdirSync(d, { recursive: true });
  writeJson(join(d, "task.json"), {
    id: name,
    title: args.title || args.slug,
    tier: args.tier,
    state: "created",
    risk: "unset",
    created: isoNow(),
  });
  const tpl = join(ROOT, "templates");
  for (const f of ["requirement.md", "design.md", "verify.md"]) {
    const src = join(tpl, f);
    if (existsSync(src)) {
      const dst = join(d, f);
      copyFileSync(src, dst);
      const h = createHash("sha256").update(readText(dst), "utf-8").digest("hex").slice(0, 16);
      writeFileSync(dst + ".hash", h, "utf-8");
    }
  }
  const cfg = readJson(CONFIG, {});
  if (cfg.execution_log) {
    writeFileSync(join(d, "execution.log"), "", "utf-8");
  }
  mkdirSync(RUNTIME, { recursive: true });
  writeFileSync(POINTER, name, "utf-8");
  console.log(`[vflow] Created task ${name} (state=created)`);
  console.log("Pipeline: created -> analyzed -> designed -> implementing -> verified -> archived");
  return 0;
}

function _recordBypass(task, transition) {
  if (!task.bypasses) task.bypasses = [];
  task.bypasses.push({
    transition,
    time: isoNow(),
  });
}

function cmdAdvance(args) {
  const d = currentTaskDir();
  if (!d) { console.log("[vflow] No active task"); return 1; }
  const p = join(d, "task.json");
  const t = readJson(p);
  if (isLegacy(t)) {
    console.log("[vflow] Legacy task (status/phase format). Use legacy commands (set phase / start / done); advance applies to v2 tasks only.");
    return 1;
  }
  const state = taskState(t);
  if (state === "archived") { console.log("[vflow] Task already archived"); return 1; }
  if (state === "verified") { console.log('[vflow] Next step is archival: run task.py done --summary "..."'); return 1; }
  const nxt = STATES[STATES.indexOf(state) + 1];
  const cfg = readJson(CONFIG, {});

  if (args.skipCheck) {
    _recordBypass(t, `${state}->${nxt}`);
    console.log("[vflow] Check skipped by user request (recorded in task.json bypasses)");
  } else {
    const errors = TRANSITION_CHECKS[nxt](d, cfg, t);
    if (errors.length) {
      console.log(`[vflow] ERROR: Cannot advance ${state} -> ${nxt}:`);
      for (const e of errors) console.log(`  - ${e}`);
      console.log("Fix the above, or use --skip-check to bypass (recorded in task.json).");
      return 1;
    }
  }

  t.state = nxt;
  if (nxt === "implementing") {
    const wl = join(d, "worklog.md");
    if (!existsSync(wl)) {
      writeFileSync(wl, "# Implementation Log\n\n| Time | File | Change |\n| :--- | :--- | :--- |\n", "utf-8");
    }
  }
  writeJson(p, t);
  console.log(`[vflow] ${state} -> ${nxt}`);
  return 0;
}

function cmdBack(_args) {
  const d = currentTaskDir();
  if (!d) { console.log("[vflow] No active task"); return 1; }
  const p = join(d, "task.json");
  const t = readJson(p);
  if (taskState(t) !== "verified") {
    console.log(`[vflow] back is only allowed from 'verified' (current: ${taskState(t)})`);
    return 1;
  }
  t.state = "implementing";
  delete t.verified_at;
  if (!t.backs) t.backs = [];
  t.backs.push(isoNow());
  writeJson(p, t);
  console.log("[vflow] verified -> implementing (re-verify required before archive)");
  return 0;
}

function cmdSet(args) {
  const d = currentTaskDir();
  if (!d) { console.log("[vflow] No active task"); return 1; }
  const p = join(d, "task.json");
  const t = readJson(p);
  const allowed = isLegacy(t) ? ["risk", "phase", "test_scope"] : ["risk", "test_scope"];
  if (!allowed.includes(args.key)) {
    console.log(`[vflow] Only ${allowed.join("/")} can be set`);
    return 1;
  }
  if (args.key === "risk" && !["low", "high"].includes(args.value)) {
    console.log("[vflow] risk must be 'low' or 'high'");
    return 1;
  }
  t[args.key] = args.value;
  writeJson(p, t);
  console.log(`[vflow] ${args.key} = ${args.value}`);
  return 0;
}

// -- legacy support (pre-v2 tasks) --

function cmdStart(args) {
  const d = currentTaskDir();
  if (!d) { console.log("[vflow] No active task"); return 1; }
  const p = join(d, "task.json");
  const t = readJson(p);
  if (!isLegacy(t)) {
    console.log("[vflow] v2 task: use task.py advance instead of start");
    return 1;
  }
  if (args.skip) {
    t.planning_skipped = true;
    console.log("[vflow] Planning skipped by user request (--skip)");
  } else {
    const errors = [];
    if (!isFilled(join(d, "requirement.md"))) {
      errors.push("requirement.md is not filled (still template or missing)");
    }
    if (!isFilled(designPath(d))) {
      errors.push("plan/design doc is not filled (still template or missing)");
    }
    if (errors.length) {
      console.log("[vflow] ERROR: Cannot start implementation. Planning docs incomplete:");
      for (const e of errors) console.log(`  - ${e}`);
      return 1;
    }
  }
  t.status = "in_progress";
  t.phase = "implement";
  writeJson(p, t);
  const tpl = join(ROOT, "templates");
  const dst = join(d, "verify.md");
  const src = join(tpl, "verify.md");
  if (existsSync(src) && !existsSync(dst)) {
    copyFileSync(src, dst);
    const h = createHash("sha256").update(readText(dst), "utf-8").digest("hex").slice(0, 16);
    writeFileSync(dst + ".hash", h, "utf-8");
  }
  const wl = join(d, "worklog.md");
  if (!existsSync(wl)) {
    writeFileSync(wl, "# Implementation Log\n\n| Time | File | Change |\n| :--- | :--- | :--- |\n", "utf-8");
  }
  console.log("[vflow] Task entered implementation phase (status=in_progress)");
  return 0;
}

function gitHead() {
  try {
    const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return r.status === 0 ? (r.stdout || "").trim() : "";
  } catch {
    return "";
  }
}

function appendJournal(task, summary) {
  mkdirSync(JOURNAL_DIR, { recursive: true });
  const jp = join(JOURNAL_DIR, "journal-1.md");
  let line = `- [${isoToday()}] [${task.title}] [${task.tier || "T2"}] ${summary}`;
  const commit = gitHead();
  if (commit) line += ` (commit:${commit})`;
  const isNew = !existsSync(jp);
  let content = "";
  if (isNew) content = "# Developer Journal\n\n";
  content += line + "\n";
  try {
    const existing = isNew ? "" : readText(jp);
    writeFileSync(jp, (isNew ? "" : existing) + content, "utf-8");
  } catch { /* */ }

  const cfg = readJson(CONFIG, {});
  const nb = ((cfg.journal || {}).notebook_path) || "";
  if (nb) {
    try {
      if (statSync(nb).isDirectory()) {
        try {
          const nbFile = join(nb, "vflow-log.md");
          const existing = existsSync(nbFile) ? readText(nbFile) : "";
          writeFileSync(nbFile, existing + line + "\n", "utf-8");
        } catch (e) {
          console.log(`[vflow] warning: notebook journal write failed: ${e.message}`);
        }
      }
    } catch { /* nb not a directory */ }
  }
}

function _archiveMove(d, t, summary) {
  t.completed = isoNow();
  writeJson(join(d, "task.json"), t);
  const monthDir = join(TASKS, "archive", yearMonth());
  mkdirSync(monthDir, { recursive: true });
  const dst = join(monthDir, basename(d));
  moveDir(d, dst);
  appendJournal(t, summary);
  if (existsSync(POINTER)) unlinkSync(POINTER);
  console.log(`[vflow] Task archived to ${relative(ROOT, dst)}`);
}

function cmdDone(args) {
  const d = currentTaskDir();
  if (!d) { console.log("[vflow] No active task"); return 1; }
  const p = join(d, "task.json");
  const t = readJson(p);
  const cfg = readJson(CONFIG, {});

  if (isLegacy(t)) {
    if (args.force) {
      t.force_archived = true;
      console.log("[vflow] Archiving with --force (skipping completion checks)");
    } else {
      const errors = [];
      if (!isFilled(join(d, "verify.md"))) {
        errors.push("verify.md is not filled (must contain real build/test output)");
      }
      const items = uncheckedItems(d);
      if (items.length) {
        errors.push(`${items.length} unchecked items in plan/design doc:`);
        for (const item of items) errors.push(`  - [ ] ${item}`);
      }
      if (errors.length) {
        console.log("[vflow] ERROR: Cannot archive. Completion checks failed:");
        for (const e of errors) console.log(`  ${e}`);
        return 1;
      }
    }
    t.status = "completed";
    _archiveMove(d, t, args.summary || "");
    return 0;
  }

  const state = taskState(t);
  if (state !== "verified" && !args.force) {
    console.log(`[vflow] ERROR: done requires state=verified (current: ${state}). Advance through the pipeline first.`);
    return 1;
  }
  if (args.force) {
    t.force_archived = true;
    console.log("[vflow] Archiving with --force (skipping completion checks)");
  } else {
    const errors = checkArchived(d, cfg, t);
    if (errors.length) {
      console.log("[vflow] ERROR: Cannot archive:");
      for (const e of errors) console.log(`  - ${e}`);
      return 1;
    }
  }
  t.state = "archived";
  _archiveMove(d, t, args.summary || "");
  return 0;
}

function cmdStatus(_args) {
  const d = currentTaskDir();
  if (!d) { console.log("[vflow] No active task (no_task)"); return 0; }
  const t = readJson(join(d, "task.json"), {});
  const state = taskState(t);
  const marker = isLegacy(t) ? " [legacy]" : "";
  const pipeline = STATES.map((s) => s === state ? `[${s}]` : s).join(" -> ");
  console.log(`[vflow] ${t.id} | ${t.title} | state=${state} risk=${t.risk}${marker}`);
  console.log(`  ${pipeline}`);
  return 0;
}

// -- argv parsing --

function parseArgs() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.log("Usage: task.mjs <create|advance|back|set|start|done|status> [options]");
    process.exit(1);
  }
  const cmd = argv[0];
  const rest = argv.slice(1);

  function getFlag(names) {
    return rest.some((a) => names.includes(a));
  }
  function getOption(names, defaultVal = "") {
    for (let i = 0; i < rest.length; i++) {
      if (names.includes(rest[i]) && i + 1 < rest.length) return rest[i + 1];
    }
    return defaultVal;
  }
  function positional(index) {
    let pos = 0;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].startsWith("-")) {
        // skip flag or option with value
        if (["--title", "--tier", "--summary"].includes(rest[i])) i++;
        continue;
      }
      if (pos === index) return rest[i];
      pos++;
    }
    return undefined;
  }

  switch (cmd) {
    case "create": {
      const slug = positional(0);
      if (!slug) { console.log("Usage: task.mjs create <slug> [--title TITLE] [--tier TIER]"); process.exit(1); }
      return { cmd, slug, title: getOption(["--title"], ""), tier: getOption(["--tier"], "T2") };
    }
    case "advance":
      return { cmd, skipCheck: getFlag(["--skip-check"]) };
    case "back":
      return { cmd };
    case "set": {
      const key = positional(0);
      const value = positional(1);
      if (!key || !value) { console.log("Usage: task.mjs set <key> <value>"); process.exit(1); }
      return { cmd, key, value };
    }
    case "start":
      return { cmd, skip: getFlag(["--skip"]) };
    case "done":
      return { cmd, summary: getOption(["--summary"], ""), force: getFlag(["--force"]) };
    case "status":
      return { cmd };
    default:
      console.log(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

// -- main --

function main() {
  const args = parseArgs();
  const handlers = {
    create: cmdCreate,
    advance: cmdAdvance,
    back: cmdBack,
    set: cmdSet,
    start: cmdStart,
    done: cmdDone,
    status: cmdStatus,
  };
  return handlers[args.cmd](args);
}

process.exit(main());
