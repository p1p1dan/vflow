import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsDir = path.join(root, 'src', 'template_vflow', 'scripts');
const distDir = path.join(scriptsDir, 'dist');
const nodeModulesDir = path.join(scriptsDir, 'node_modules');
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const tscCli = path.join(nodeModulesDir, 'typescript', 'bin', 'tsc');
const quiet = process.env.npm_config_json === 'true';

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function run(command, args) {
  // When this build runs under `npm publish` (via prepublishOnly), the parent
  // npm injects npm_config_* env vars (prefix, etc.) that hijack the nested
  // `npm ci --prefix` below and install to the wrong place. Strip them so the
  // nested npm runs in the same clean env as a manual invocation.
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^npm_config_/i.test(k))
  );
  const result = spawnSync(command, args, {
    cwd: scriptsDir,
    env: { ...cleanEnv, npm_config_json: 'false' },
    stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
}

function runNpm(args) {
  if (fs.existsSync(npmCli)) {
    run(process.execPath, [npmCli, ...args]);
    return;
  }
  run('npm', args);
}

rm(distDir);
rm(nodeModulesDir);

try {
  runNpm(['--prefix', scriptsDir, 'ci']);
  if (!fs.existsSync(tscCli)) {
    throw new Error(`Local TypeScript compiler not found: ${tscCli}`);
  }
  run(process.execPath, [tscCli]);
} finally {
  rm(nodeModulesDir);
}
