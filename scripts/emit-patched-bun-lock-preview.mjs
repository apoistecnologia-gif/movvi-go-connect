import { copyFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (process.env.VERCEL_ENV !== 'preview') process.exit(0);
copyFileSync('bun.lock.baseline', 'bun.lock');
const updated = spawnSync('npx', ['--yes', 'bun@1.3.14', 'update', '@tanstack/react-start', '--lockfile-only'], {
  timeout: 240000, encoding: 'utf8',
});
if (updated.status !== 0) {
  console.error('APOIS_LOCK_UPDATE_FAILED ' + String(updated.stderr).slice(0, 1500));
  process.exit(1);
}
const lock = readFileSync('bun.lock', 'utf8');
if (!lock.includes('@tanstack/react-start@1.168.60')) {
  throw new Error('The patched TanStack Start version was not resolved');
}
const patch = spawnSync('git', ['diff', '--no-index', '--unified=2', '--', 'bun.lock.baseline', 'bun.lock'], {
  encoding: 'utf8', maxBuffer: 12 * 1024 * 1024,
}).stdout;
console.log('APOIS_LOCK_UPDATED length=' + lock.length + ' patch_length=' + patch.length);
if (patch.length > 80000) {
  console.log('APOIS_LOCK_PATCH_TOO_LARGE');
} else {
  console.log('APOIS_LOCK_PATCH_BEGIN');
  for (let i = 0, index = 0; i < patch.length; i += 1200, index++) {
    console.log('APOIS_LOCK_PATCH_CHUNK ' + index + ' ' + JSON.stringify(patch.slice(i, i + 1200)));
  }
  console.log('APOIS_LOCK_PATCH_END');
}
