import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAX_FILE_BYTES = 50 * 1024 * 1024; // Keep every file comfortably below GitHub's 50MB warning / 100MB limit
const MAX_DIST_BYTES = 450 * 1024 * 1024;

async function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  // 1. Verify .gitignore blocks all unencrypted sources and raw media
  const gitignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
  const requiredIgnores = [
    'scans/',
    '*.pdf',
    'raw_assets/',
    'assets_raw/',
    'content/',
    'vault_src/',
    'public/images/',
    'public/media/',
    'src/data/',
  ];
  for (const req of requiredIgnores) {
    if (!gitignore.includes(req)) {
      throw new Error(`PRIVACY VIOLATION: .gitignore is missing required entry "${req}"`);
    }
  }

  // 2. Verify no plaintext asset directories exist in public/ or src/
  const forbiddenDirs = [
    path.join(ROOT, 'public', 'images'),
    path.join(ROOT, 'public', 'media'),
    path.join(ROOT, 'src', 'data'),
  ];
  for (const d of forbiddenDirs) {
    if (existsSync(d)) {
      throw new Error(`PRIVACY VIOLATION: Unencrypted directory exists in tracked tree: ${path.relative(ROOT, d)}`);
    }
  }

  // 3. Verify no unencrypted media/images/PDFs exist in public/, src/, or dist/
  const disallowedMediaExt = /\.(pdf|mov|m4a|mp3|mp4|webm|jpe?g|png|webp|avif|gif)$/i;
  const checkDirs = [path.join(ROOT, 'public'), path.join(ROOT, 'dist'), path.join(ROOT, 'src')];
  for (const dir of checkDirs) {
    const files = await walk(dir);
    for (const f of files) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      if (disallowedMediaExt.test(rel)) {
        throw new Error(`PRIVACY VIOLATION: Unencrypted media/image/document found in served/source tree: ${rel}`);
      }
      if (/page_\d{3}\./i.test(rel) || /00[123]_intro_[123]\./i.test(rel)) {
        throw new Error(`PRIVACY VIOLATION: Raw scan filename found in served/source tree: ${rel}`);
      }
    }
  }

  // 4. Verify encrypted vault structure, opaque filenames, and GitHub file size limits
  const vaultDir = path.join(ROOT, 'public', 'vault');
  const descriptorPath = path.join(vaultDir, 'vault.json');
  const payloadPath = path.join(vaultDir, 'payload.enc');
  if (!existsSync(descriptorPath) || !existsSync(payloadPath)) {
    throw new Error('VAULT ERROR: Missing public/vault/vault.json or public/vault/payload.enc');
  }

  const descriptor = JSON.parse(await fs.readFile(descriptorPath, 'utf8'));
  if (descriptor.cipher !== 'AES-256-GCM' || descriptor.kdf !== 'PBKDF2' || descriptor.iterations < 600000) {
    throw new Error('VAULT ERROR: Weak or unexpected cipher/KDF settings in public/vault/vault.json');
  }

  const vaultFiles = await walk(vaultDir);
  let vaultBytes = 0;
  let encCount = 0;
  for (const f of vaultFiles) {
    const base = path.basename(f);
    const stat = await fs.stat(f);
    vaultBytes += stat.size;
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`SIZE LIMIT VIOLATION: ${base} is ${(stat.size / 1024 / 1024).toFixed(2)} MB (> 50 MB)`);
    }
    if (base === 'vault.json') continue;
    if (!/^(payload|[0-9a-f]{16})\.enc$/.test(base)) {
      throw new Error(`PRIVACY VIOLATION: Non-opaque filename in public/vault/: ${base}`);
    }
    encCount++;
  }

  if (encCount !== descriptor.assetCount + 1) {
    throw new Error(`VAULT ERROR: Expected ${descriptor.assetCount + 1} .enc files, found ${encCount}`);
  }

  // 5. Verify crawler & referrer protections
  const indexHtml = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  if (!indexHtml.includes('noindex, nofollow') || !indexHtml.includes('no-referrer')) {
    throw new Error('PRIVACY VIOLATION: index.html missing noindex/nofollow or no-referrer meta tags');
  }
  const robotsTxt = await fs.readFile(path.join(ROOT, 'public', 'robots.txt'), 'utf8');
  if (!robotsTxt.includes('Disallow: /')) {
    throw new Error('PRIVACY VIOLATION: public/robots.txt missing Disallow: /');
  }

  // 6. Verify dist/ total size if built
  const distDir = path.join(ROOT, 'dist');
  if (existsSync(distDir)) {
    const distFiles = await walk(distDir);
    let distBytes = 0;
    for (const f of distFiles) {
      distBytes += (await fs.stat(f)).size;
    }
    if (distBytes > MAX_DIST_BYTES) {
      throw new Error(`SIZE LIMIT VIOLATION: dist/ is ${(distBytes / 1024 / 1024).toFixed(2)} MB (> 450 MB)`);
    }
  }

  // 7. Optional local plaintext-term scan via environment variable (never hardcoded in tracked code)
  const forbiddenRaw = process.env.AUDIT_FORBIDDEN_TERMS || '';
  const terms = forbiddenRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);

  if (terms.length > 0) {
    const textTargets = [
      path.join(ROOT, 'index.html'),
      path.join(ROOT, 'package.json'),
      path.join(ROOT, 'public', 'vault', 'vault.json'),
      ...(await walk(path.join(ROOT, 'src'))),
      ...(await walk(path.join(ROOT, 'scripts'))),
      ...(existsSync(path.join(ROOT, 'dist', 'assets')) ? await walk(path.join(ROOT, 'dist', 'assets')) : []),
      ...(existsSync(path.join(ROOT, 'dist', 'index.html')) ? [path.join(ROOT, 'dist', 'index.html')] : []),
    ];

    for (const file of textTargets) {
      const content = await fs.readFile(file, 'utf8');
      const lower = content.toLowerCase();
      for (const term of terms) {
        if (lower.includes(term.toLowerCase())) {
          throw new Error(
            `PLAINTEXT LEAK DETECTED: Forbidden term matched in ${path.relative(ROOT, file).replace(/\\/g, '/')}`
          );
        }
      }
    }
  }

  console.log(
    `PRIVACY & VAULT AUDIT PASSED: ${encCount} opaque AES-256-GCM blobs (${(vaultBytes / 1024 / 1024).toFixed(
      2
    )} MB), zero unencrypted media, zero tracked plaintext leaks.`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
