import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const built = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: root, stdio: 'inherit', env: {...process.env, NIGHTKEEPER_DESKTOP: 'true', NIGHTKEEPER_DEMO: 'true'}
});
if (built.status !== 0) process.exit(built.status || 1);
const target = path.join(root, 'desktop/resources/server');
rmSync(target, {recursive:true, force:true});
mkdirSync(target, {recursive:true});
cpSync(path.join(root,'.next-desktop/standalone'), target, {recursive:true});
cpSync(path.join(root,'.next-desktop/static'), path.join(target,'.next-desktop/static'), {recursive:true});
if(existsSync(path.join(root,'public'))) cpSync(path.join(root,'public'), path.join(target,'public'), {recursive:true});
