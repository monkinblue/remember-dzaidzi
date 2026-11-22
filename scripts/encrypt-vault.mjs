import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VAULT_SRC = path.join(ROOT, 'vault_src');
const OUT_DIR = path.join(ROOT, 'public', 'vault');

const PBKDF2_ITERATIONS = 600_000;
const KEY_LEN = 32; // AES-256

const MIME_BY_EXT = new Map([
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
]);

function encryptBuffer(plaintextBuf, keyBytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes, appended directly for Web Crypto AES-GCM compatibility
  return Buffer.concat([iv, encrypted, authTag]);
}

function collectReferencedAssetPaths(appHtml, chalkArt, mediaManifest) {
  const paths = new Set();

  // Extract data-vault-src="/..." references from exhibition HTML
  const htmlMatches = appHtml.matchAll(/data-vault-src="([^"]+)"/g);
  for (const m of htmlMatches) {
    if (m[1]) paths.add(m[1]);
  }

  // Extract active WebP full & thumbnail plates from chalk gallery manifest
  for (const art of chalkArt) {
    if (art.fullSrc) paths.add(art.fullSrc);
    if (art.thumbWebp) paths.add(art.thumbWebp);
  }

  // Extract documentary audio & optional video
  if (mediaManifest.audioSrc) {
    paths.add(mediaManifest.audioSrc);
  }
  if (mediaManifest.hasVideo && mediaManifest.video?.src) {
    paths.add(mediaManifest.video.src);
  }

  return Array.from(paths).sort();
}

async function main() {
  const password = process.env.VAULT_PASSWORD;
  if (!password || password.trim().length < 6) {
    console.error(
      'ERROR: Set VAULT_PASSWORD environment variable (at least 6 characters) before running encrypt-vault.mjs.\n' +
        'Example (PowerShell): $env:VAULT_PASSWORD="your-passphrase"; node scripts/encrypt-vault.mjs'
    );
    process.exit(1);
  }

  const exhibitionHtmlPath = path.join(VAULT_SRC, 'exhibition.html');
  const journalPath = path.join(VAULT_SRC, 'data', 'journal.json');
  const chalkPath = path.join(VAULT_SRC, 'data', 'chalk-art.json');
  const mediaPath = path.join(VAULT_SRC, 'data', 'media-manifest.json');

  for (const reqPath of [exhibitionHtmlPath, journalPath, chalkPath, mediaPath]) {
    if (!existsSync(reqPath)) {
      throw new Error(`Missing local vault source file: ${path.relative(ROOT, reqPath)}`);
    }
  }

  const [appHtml, journalRaw, chalkRaw, mediaRaw] = await Promise.all([
    fs.readFile(exhibitionHtmlPath, 'utf8'),
    fs.readFile(journalPath, 'utf8'),
    fs.readFile(chalkPath, 'utf8'),
    fs.readFile(mediaPath, 'utf8'),
  ]);

  const journal = JSON.parse(journalRaw);
  const chalkArt = JSON.parse(chalkRaw);
  const mediaManifest = JSON.parse(mediaRaw);

  // Derive 256-bit AES key from passphrase via PBKDF2-HMAC-SHA256
  const salt = crypto.randomBytes(16);
  const keyBytes = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');

  // Clean and recreate public/vault/
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const assetLogicalPaths = collectReferencedAssetPaths(appHtml, chalkArt, mediaManifest);
  const assetsMap = {};
  let totalEncryptedBytes = 0;

  for (const logicalPath of assetLogicalPaths) {
    const cleanRel = logicalPath.replace(/^\/+/, '');
    const srcFile = path.join(VAULT_SRC, 'public', cleanRel);
    if (!existsSync(srcFile)) {
      throw new Error(`Referenced asset not found in vault_src/public/: ${cleanRel}`);
    }

    const ext = path.extname(srcFile).toLowerCase();
    const mimeType = MIME_BY_EXT.get(ext) || 'application/octet-stream';
    const rawBuf = await fs.readFile(srcFile);
    const encBuf = encryptBuffer(rawBuf, keyBytes);

    // Keyed HMAC filename leaks zero information about original asset names or categories
    const opaqueName = `${crypto.createHmac('sha256', keyBytes).update(logicalPath).digest('hex').slice(0, 16)}.enc`;
    await fs.writeFile(path.join(OUT_DIR, opaqueName), encBuf);

    assetsMap[logicalPath] = {
      vaultPath: `/vault/${opaqueName}`,
      mimeType,
      bytes: rawBuf.length,
    };
    totalEncryptedBytes += encBuf.length;
  }

  // Assemble the encrypted exhibition payload (HTML, 233-page journal, chalk metadata, audio manifest, asset index)
  const payloadObj = {
    version: 1,
    documentTitle: `Remembering ${journal.meta.monikers[0]} — ${journal.meta.author}`,
    editorialSourceNote: `This 51-minute documentary conversation synthesizes ${journal.meta.author}’s complete ${journal.meta.totalPages}-page handwritten journal verbatim. Every anecdote discussed in the audio can be read word-for-word in the Monograph below:`,
    appHtml,
    journal,
    chalkArt,
    mediaManifest,
    assets: assetsMap,
  };

  const payloadBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const payloadEnc = encryptBuffer(payloadBuf, keyBytes);
  await fs.writeFile(path.join(OUT_DIR, 'payload.enc'), payloadEnc);
  totalEncryptedBytes += payloadEnc.length;

  // Write public metadata descriptor (contains zero PII, zero secrets, zero filenames)
  const descriptor = {
    version: 1,
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    saltB64: salt.toString('base64'),
    payloadPath: '/vault/payload.enc',
    assetCount: assetLogicalPaths.length,
  };

  await fs.writeFile(path.join(OUT_DIR, 'vault.json'), `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8');

  const mb = (totalEncryptedBytes / (1024 * 1024)).toFixed(2);
  console.log(
    `Vault encrypted successfully: ${assetLogicalPaths.length} media assets + payload.enc (${mb} MB total) -> public/vault/`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
