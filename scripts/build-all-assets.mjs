import { execFileSync } from 'node:child_process';

const steps = [
  'scripts/process-portrait.mjs',
  'scripts/process-dedication.mjs',
  'scripts/process-chalk-art.mjs',
  'scripts/process-media.mjs',
  'scripts/build-monograph.mjs',
  'scripts/audit-privacy.mjs',
];

for (const script of steps) {
  console.log(`\n=== Running ${script} ===`);
  execFileSync(process.execPath, [script], { stdio: 'inherit' });
}
