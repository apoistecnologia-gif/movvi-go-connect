import { copyFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (process.env.VERCEL_ENV !== 'preview') {
  process.exit(0);
}
const baseline = 'bun.lock.baseline';
copyFileSync(baseline, 'bun.lock');
try {
  const stdout = execFileSync('npx', ['--yes', 'bun@1.3.14', 'install', '--lockfile-only'], {
    timeout: 240000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('APOIS_LOCK_UPDATE_EXECUTED ' + stdout.trim().slice(0, 350));
} catch (error) {
  console.error('APOIS_LOCK_UPDATE_FAILED ' + String(error?.stderr ?? error).slice(0, 1000));
  process.exit(1);
}
const lock = readFileSync('bun.lock', 'utf8');
if (!lock.includes('@tanstack/react-start@1.168.60')) {
  throw new Error('The patched TanStack Start version was not resolved.');
}
console.log('APOIS_LOCK_BEGIN length=' + lock.length);
for (let i = 0, index = 0; i < lock.length; i += 2600, index++) {
  console.log('APOIS_LOCK_CHUNK ' + index + ' ' + JSON.stringify(lock.slice(i, i + 2600)));
}
console.log('APOIS_LOCK_END');
