import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'raw_assets', 'Intro', 'Gemini_Generated_Image_hh46pwhh46pwhh46.jpg');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'dedication');

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const meta = await sharp(INPUT).metadata();
  const origW = meta.width;
  const origH = meta.height;

  // Crop inside the outer linen fringe border while preserving 100% of every handwritten stroke
  // (including "To" at top-left, "grandfathe" right up to the right edge, and "great grandfather...." at bottom).
  const cropLeft = Math.round(origW * 0.022);
  const cropTop = Math.round(origH * 0.055);
  const cropWidth = Math.round(origW * 0.962);
  const cropHeight = Math.round(origH * 0.895);

  // Upscale crisply with Lanczos3 so calligraphy strokes are razor-sharp on 2x Retina displays
  const targetW = 2200;
  const targetH = Math.round((cropHeight / cropWidth) * targetW);

  const grayBuf = await sharp(INPUT)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .resize(targetW, targetH, { kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .raw()
    .toBuffer();

  // Compute local background illumination (linen weave + horizontal fold shadow) via wide Gaussian blur
  const bgBuf = await sharp(grayBuf, { raw: { width: targetW, height: targetH, channels: 1 } })
    .blur(34)
    .raw()
    .toBuffer();

  // Extract pure wet-ink alpha without mutating a single letterform:
  // Normalize each pixel against local background brightness so the linen weave & fold shadow vanish 100%.
  const darkInkRGBA = Buffer.alloc(targetW * targetH * 4);
  const lightInkRGBA = Buffer.alloc(targetW * targetH * 4);

  let minInkX = targetW, maxInkX = 0, minInkY = targetH, maxInkY = 0;

  for (let y = 0; y < targetH; y++) {
    const ny = y / targetH;
    for (let x = 0; x < targetW; x++) {
      const nx = x / targetW;
      const i = y * targetW + x;
      const lum = grayBuf[i];
      const bg = Math.max(80, bgBuf[i]);
      const ratio = lum / bg;

      // Guard very outer 0.8% margin against any stray linen fringe thread
      // EXCEPT on the right side near y=0.82..0.92 where "grandfathe" reaches close to the right edge!
      let edgeMask = 1.0;
      if (nx < 0.008) edgeMask *= smoothstep(0.0, 0.008, nx);
      if (ny < 0.008) edgeMask *= smoothstep(0.0, 0.008, ny);
      if (ny > 0.992) edgeMask *= smoothstep(1.0, 0.992, ny);
      if (nx > 0.994 && (ny < 0.80 || ny > 0.93)) {
        edgeMask *= smoothstep(1.0, 0.994, nx);
      }

      // Linen weave peaks/valleys sit around ratio 0.86..1.05; ink strokes sit at ratio 0.12..0.72.
      // Smooth Hermite curve preserves natural pen edge anti-aliasing and ink density variations!
      const rawAlpha = 1 - smoothstep(0.46, 0.80, ratio);
      const alpha = clamp01(rawAlpha * edgeMask);
      const aByte = Math.round(alpha * 255);

      if (aByte > 32) {
        if (x < minInkX) minInkX = x;
        if (x > maxInkX) maxInkX = x;
        if (y < minInkY) minInkY = y;
        if (y > maxInkY) maxInkY = y;
      }

      const o = i * 4;
      // Rich wet archival fountain ink (#181410 with subtle darker core on heavy pen pressure)
      const density = clamp01((0.78 - ratio) / 0.55);
      darkInkRGBA[o] = Math.round(34 - 16 * density);
      darkInkRGBA[o + 1] = Math.round(28 - 14 * density);
      darkInkRGBA[o + 2] = Math.round(22 - 12 * density);
      darkInkRGBA[o + 3] = aByte;

      // Warm museum parchment-gold ink (#f4ebd9) for dark gallery slate surfaces
      lightInkRGBA[o] = Math.round(232 + 16 * density);
      lightInkRGBA[o + 1] = Math.round(221 + 16 * density);
      lightInkRGBA[o + 2] = Math.round(200 + 18 * density);
      lightInkRGBA[o + 3] = aByte;
    }
  }

  // Tight-trim with balanced breathing padding around actual ink bounding box
  const pad = 36;
  const trimLeft = Math.max(0, minInkX - pad);
  const trimTop = Math.max(0, minInkY - pad);
  const trimW = Math.min(targetW - trimLeft, maxInkX - minInkX + pad * 2);
  const trimH = Math.min(targetH - trimTop, maxInkY - minInkY + pad * 2);

  const rawOpts = { raw: { width: targetW, height: targetH, channels: 4 } };
  const trimBox = { left: trimLeft, top: trimTop, width: trimW, height: trimH };

  await Promise.all([
    sharp(darkInkRGBA, rawOpts)
      .extract(trimBox)
      .webp({ quality: 92, alphaQuality: 95 })
      .toFile(path.join(OUT_DIR, 'dedication-ink-dark-2000.webp')),
    sharp(darkInkRGBA, rawOpts)
      .extract(trimBox)
      .resize(1200)
      .webp({ quality: 90, alphaQuality: 92 })
      .toFile(path.join(OUT_DIR, 'dedication-ink-dark-1200.webp')),
    sharp(darkInkRGBA, rawOpts)
      .extract(trimBox)
      .resize(1200)
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, 'dedication-ink-dark-1200.png')),

    sharp(lightInkRGBA, rawOpts)
      .extract(trimBox)
      .resize(1400)
      .webp({ quality: 90, alphaQuality: 92 })
      .toFile(path.join(OUT_DIR, 'dedication-ink-light-1400.webp')),
  ]);

  // Also render a quick composite preview onto rag-paper in scratch/ so we can visually inspect the ink extraction!
  const scratchPreview = 'C:/Users/RobaD/.gemini/antigravity/brain/6a0f938a-3cda-4334-adee-7884234cf29b/scratch/dedication_preview.jpg';
  const inkPng = await sharp(darkInkRGBA, rawOpts).extract(trimBox).resize(1200).png().toBuffer();
  const previewMeta = await sharp(inkPng).metadata();
  await sharp({
    create: {
      width: previewMeta.width + 80,
      height: previewMeta.height + 80,
      channels: 3,
      background: { r: 244, g: 238, b: 225 },
    },
  })
    .composite([{ input: inkPng, left: 40, top: 40 }])
    .jpeg({ quality: 90 })
    .toFile(scratchPreview);

  console.log(`Dedication ink extracted (${trimW}x${trimH}) -> public/images/dedication/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
