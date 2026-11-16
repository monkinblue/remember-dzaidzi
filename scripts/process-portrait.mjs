import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'raw_assets', 'portrait', 'Photo0002.jpg');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'portrait');

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Original is 972 x 1136.
  // Crop 54..854 x 146..1136 (800 x 990 -> scaled to 1600 x 2000 4:5 museum plate).
  // At left=54, almost all of the left-edge foreground face/blonde hair is cleanly outside the frame,
  // while 100% of Colonel Buchta's curly silver hair, right ear, glasses, raised arm, and V-neck sweater remain intact!
  const crop = { left: 54, top: 144, width: 792, height: 990 };

  const { data, info } = await sharp(INPUT)
    .extract(crop)
    .resize(1600, 2000, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.72, m1: 0.55, m2: 1.6 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const colorBuf = Buffer.alloc(data.length);
  const archivalBuf = Buffer.alloc(data.length);

  const darkBgR = 12;
  const darkBgG = 15;
  const darkBgB = 22;

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const idx = (y * width + x) * channels;

      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      // 1. Clean isolated white scanner dust speck on upper wall (around nx=0.53, ny < 0.12)
      if (ny < 0.14 && nx > 0.2 && nx < 0.8) {
        const lum = (r + g + b) / 3;
        if (lum > 224) {
          r = 204;
          g = 197;
          b = 203;
        }
      }

      // 2. Continuous C2-smooth elliptical museum spotlight centered on Colonel Buchta
      const dx = (nx - 0.37) / 0.50;
      const dy = (ny - 0.47) / 0.47;
      const dist = Math.hypot(dx, dy);
      let light = 1 - 0.70 * smoothstep(0.74, 1.42, dist);

      // 3. Smooth 2D elliptical feather at upper-left edge (eliminates residual blonde hair wisp with zero seam)
      const ulDist = Math.hypot((nx + 0.02) / 0.09, (ny - 0.24) / 0.28);
      if (ulDist < 1.0) {
        const ulFade = smoothstep(0.15, 1.0, ulDist);
        light *= 0.22 + 0.78 * ulFade;
      }

      // 4. Smooth diagonal shadow veil over the out-of-focus beige foreground shoulder in bottom-left corner
      // Below the diagonal line ny = 0.74 + nx * 0.72, blend softly into deep navy-charcoal shadow
      const diag = ny - (0.725 + nx * 0.74);
      if (diag > -0.06) {
        const fgWeight = smoothstep(-0.06, 0.08, diag);
        // Blend beige foreground blur gently into deep museum navy shadow matching sweater shadow
        r = r * (1 - 0.86 * fgWeight) + 16 * (0.86 * fgWeight);
        g = g * (1 - 0.86 * fgWeight) + 17 * (0.86 * fgWeight);
        b = b * (1 - 0.84 * fgWeight) + 28 * (0.84 * fgWeight);
      }

      // 5. Smooth 2D elliptical shadow over upper-right lampshade corner
      const urDist = Math.hypot((nx - 1.02) / 0.30, (ny - 0.05) / 0.38);
      if (urDist < 1.0) {
        const urFade = smoothstep(0.08, 1.0, urDist);
        light *= 0.20 + 0.80 * urFade;
      }

      // 6. Gentle top gallery falloff
      if (ny < 0.18) {
        const topFade = smoothstep(0.0, 0.18, ny);
        light *= 0.50 + 0.50 * topFade;
      }

      const cr = Math.round(darkBgR + (r - darkBgR) * light);
      const cg = Math.round(darkBgG + (g - darkBgG) * light);
      const cb = Math.round(darkBgB + (b - darkBgB) * light);

      colorBuf[idx] = clamp01(cr / 255) * 255;
      colorBuf[idx + 1] = clamp01(cg / 255) * 255;
      colorBuf[idx + 2] = clamp01(cb / 255) * 255;

      // Archival platinum-palladium plate
      const lumNorm = clamp01((0.299 * cr + 0.587 * cg + 0.114 * cb) / 255);
      const curved = clamp01(Math.pow(lumNorm, 1.04) * 1.02);
      let ar, ag, ab;
      if (curved < 0.5) {
        const t = curved / 0.5;
        ar = 13 + (142 - 13) * t;
        ag = 16 + (132 - 16) * t;
        ab = 23 + (120 - 23) * t;
      } else {
        const t = (curved - 0.5) / 0.5;
        ar = 142 + (243 - 142) * t;
        ag = 132 + (234 - 132) * t;
        ab = 120 + (218 - 120) * t;
      }
      archivalBuf[idx] = Math.round(ar * 0.82 + cr * 0.18);
      archivalBuf[idx + 1] = Math.round(ag * 0.82 + cg * 0.18);
      archivalBuf[idx + 2] = Math.round(ab * 0.82 + cb * 0.18);
    }
  }

  const rawOpts = { raw: { width, height, channels } };

  await Promise.all([
    sharp(colorBuf, rawOpts).resize(1200, 1500).avif({ quality: 72 }).toFile(path.join(OUT_DIR, 'col-buchta-color-1200.avif')),
    sharp(colorBuf, rawOpts).resize(800, 1000).avif({ quality: 70 }).toFile(path.join(OUT_DIR, 'col-buchta-color-800.avif')),
    sharp(colorBuf, rawOpts).resize(1200, 1500).webp({ quality: 84 }).toFile(path.join(OUT_DIR, 'col-buchta-color-1200.webp')),
    sharp(colorBuf, rawOpts).resize(800, 1000).webp({ quality: 82 }).toFile(path.join(OUT_DIR, 'col-buchta-color-800.webp')),
    sharp(colorBuf, rawOpts).resize(1000, 1250).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(OUT_DIR, 'col-buchta-color-1000.jpg')),

    sharp(archivalBuf, rawOpts).resize(1200, 1500).avif({ quality: 72 }).toFile(path.join(OUT_DIR, 'col-buchta-archival-1200.avif')),
    sharp(archivalBuf, rawOpts).resize(800, 1000).avif({ quality: 70 }).toFile(path.join(OUT_DIR, 'col-buchta-archival-800.avif')),
    sharp(archivalBuf, rawOpts).resize(1200, 1500).webp({ quality: 84 }).toFile(path.join(OUT_DIR, 'col-buchta-archival-1200.webp')),
    sharp(archivalBuf, rawOpts).resize(800, 1000).webp({ quality: 82 }).toFile(path.join(OUT_DIR, 'col-buchta-archival-800.webp')),
  ]);

  console.log('Refined portrait complete -> public/images/portrait/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
