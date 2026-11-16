import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

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
  const gitignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
  const requiredIgnores = ['scans/', '*.pdf', 'raw_assets/', 'assets_raw/'];
  for (const req of requiredIgnores) {
    if (!gitignore.includes(req)) {
      throw new Error(`PRIVACY VIOLATION: .gitignore is missing required entry "${req}"`);
    }
  }

  const checkDirs = [path.join(ROOT, 'public'), path.join(ROOT, 'dist'), path.join(ROOT, 'src')];
  for (const dir of checkDirs) {
    const files = await walk(dir);
    for (const f of files) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      if (/\.pdf$/i.test(rel)) {
        throw new Error(`PRIVACY VIOLATION: PDF file found in served/source directory: ${rel}`);
      }
      if (/page_\d{3}\.jpe?g$/i.test(rel) || /00[123]_intro_[123]\.jpe?g$/i.test(rel)) {
        throw new Error(`PRIVACY VIOLATION: Raw scan photocopy found in served/source directory: ${rel}`);
      }
      if (/\.mov$/i.test(rel)) {
        throw new Error(`PRIVACY VIOLATION: Unprocessed raw .MOV file found in served/source directory: ${rel}`);
      }
    }
  }

  // Also ensure src/data/journal.json contains zero raw scan file references like page_009.jpg
  const journalJsonPath = path.join(ROOT, 'src', 'data', 'journal.json');
  if (existsSync(journalJsonPath)) {
    const content = await fs.readFile(journalJsonPath, 'utf8');
    if (/page_\d{3}\.jpg/i.test(content) || /001_intro_1\.jpg/i.test(content)) {
      throw new Error('PRIVACY VIOLATION: journal.json leaks raw scan filenames');
    }
  }

  console.log('PRIVACY AUDIT PASSED: Zero raw scans, zero PDFs, and .gitignore rules verified.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
