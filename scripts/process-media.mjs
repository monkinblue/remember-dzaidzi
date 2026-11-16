import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const ROOT = process.cwd();
const RAW_MEDIA_DIR = path.join(ROOT, 'raw_assets', 'media');
const OUT_MEDIA_DIR = path.join(ROOT, 'public', 'media');
const DATA_OUT = path.join(ROOT, 'src', 'data', 'media-manifest.json');

function decodeMonoPCM(inputPath, sampleRate = 2000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const proc = spawn(
      ffmpegPath,
      ['-v', 'error', '-i', inputPath, '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', 'pipe:1'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let errText = '';
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (c) => {
      errText += c.toString();
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with ${code}: ${errText}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

async function main() {
  await fs.mkdir(OUT_MEDIA_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DATA_OUT), { recursive: true });

  const entries = existsSync(RAW_MEDIA_DIR) ? await fs.readdir(RAW_MEDIA_DIR) : [];
  const audioFile = entries.find((f) => /\.(m4a|mp3|wav|ogg|aac)$/i.test(f));
  const videoFile = entries.find((f) => /\.(mp4|webm)$/i.test(f)) || null;

  if (!audioFile) {
    throw new Error('No audio documentary found in raw_assets/media/');
  }

  const rawAudioPath = path.join(RAW_MEDIA_DIR, audioFile);
  const publicAudioName = 'col-buchta-audio-documentary.m4a';
  const publicAudioPath = path.join(OUT_MEDIA_DIR, publicAudioName);
  await fs.copyFile(rawAudioPath, publicAudioPath);

  // Decode 2000 Hz mono PCM to compute exact duration and 720 studio-grade waveform bars
  const sampleRate = 2000;
  const pcmBuf = await decodeMonoPCM(rawAudioPath, sampleRate);
  const totalSamples = Math.floor(pcmBuf.length / 2);
  const durationSeconds = Number((totalSamples / sampleRate).toFixed(2));

  const barCount = 720;
  const samplesPerBar = Math.floor(totalSamples / barCount);
  const rawBars = new Float64Array(barCount);
  let maxBar = 0.0001;

  for (let b = 0; b < barCount; b++) {
    const start = b * samplesPerBar;
    const end = Math.min(totalSamples, start + samplesPerBar);
    let sumSq = 0;
    let peak = 0;
    for (let s = start; s < end; s++) {
      const val = Math.abs(pcmBuf.readInt16LE(s * 2)) / 32768;
      sumSq += val * val;
      if (val > peak) peak = val;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    // Blend RMS body + transient peak for expressive NYT Audio / SoundCloud style bar profile
    const combined = rms * 0.68 + peak * 0.32;
    rawBars[b] = combined;
    if (combined > maxBar) maxBar = combined;
  }

  const peaks = Array.from(rawBars, (v) => {
    const norm = Math.pow(Math.min(1, v / maxBar), 0.78);
    return Number(Math.max(0.07, norm).toFixed(3));
  });

  // Snap chapter timestamps to nearest natural conversational pause (+/- 18s window)
  function snapToPause(approxSec) {
    if (approxSec <= 5) return 0;
    const windowSec = 18;
    const minSample = Math.max(0, Math.floor((approxSec - windowSec) * sampleRate));
    const maxSample = Math.min(totalSamples - sampleRate, Math.floor((approxSec + windowSec) * sampleRate));
    const hop = Math.floor(sampleRate * 0.25);
    const winLen = Math.floor(sampleRate * 0.55);

    let quietestSec = approxSec;
    let lowestEnergy = Infinity;

    for (let s = minSample; s < maxSample; s += hop) {
      let e = 0;
      for (let k = 0; k < winLen; k++) {
        const v = pcmBuf.readInt16LE((s + k) * 2) / 32768;
        e += v * v;
      }
      if (e < lowestEnergy) {
        lowestEnergy = e;
        quietestSec = Math.round(s / sampleRate);
      }
    }
    return quietestSec;
  }

  const chapters = [
    {
      id: 'ch-1',
      index: 'I',
      title: '“To Those Interested in My Life” — 41 Elm Street & Binghamton Roots',
      startTime: 0,
      summary:
        'Growing up the oldest of ten children in a Slovak and Rusyn immigrant family in Binghamton, New York—paper routes, Grandma Buchta’s Sunday chickens, Ozalid, and learning golf from his father.',
      journalPages: ['intro-1', '9', '11', '12', '14', '52'],
    },
    {
      id: 'ch-2',
      index: 'II',
      title: 'Le Moyne, Quitting Med School & Meeting Longina at a 22nd Baptism',
      startTime: snapToPause(Math.round(durationSeconds * 0.14)),
      summary:
        'A Gannett paperboy scholarship to Le Moyne College, leaving medical school in 1962, becoming a “90-day wonder” 2nd Lieutenant at Lackland OTS, and falling for Longina Fisch.',
      journalPages: ['10', '56', '58', '67', '70', '74'],
    },
    {
      id: 'ch-3',
      index: 'III',
      title: '1st Combat Applications Group & Vietnam-Era Weapons Flight Testing',
      startTime: snapToPause(Math.round(durationSeconds * 0.28)),
      summary:
        'Flying test missions out of Eglin and Hurlburt Field aboard C-130s, A-1 Skyraiders, and B-26s—testing jungle flares, cluster munitions, and low-light cameras before earning his master’s at RPI.',
      journalPages: ['75', '76', '78', '79', '80'],
    },
    {
      id: 'ch-4',
      index: 'IV',
      title: 'The A-10 “Tank-Killer” 30mm GAU-8 Program & Full Bull Colonel',
      startTime: snapToPause(Math.round(durationSeconds * 0.43)),
      summary:
        'Leading the 30mm depleted-uranium ammunition development that turned the A-10 Thunderbolt II into a legend for ground troops, attaining O-6 Colonel, and 13 post-military years at SenCom on missile defense.',
      journalPages: ['81', '82', '232', '234'],
    },
    {
      id: 'ch-5',
      index: 'V',
      title: 'Grief, Resilience & Finding Joy Again with Tracy at 328 Lakewood Blvd',
      startTime: snapToPause(Math.round(durationSeconds * 0.59)),
      summary:
        'Losing Longina to breast cancer in 1990, hitchhiking through a Colorado blizzard to walk Monica down the aisle, meeting Tracy at SenCom, Cape Cod vows, and life in Maple Bluff.',
      journalPages: ['69', '92', '104', '157', '205', '208', '231', '226'],
    },
    {
      id: 'ch-6',
      index: 'VI',
      title: 'Freezer-Door Chalk Cartoons, MARGA Golf & The July 4th Fireworks Bust',
      startTime: snapToPause(Math.round(durationSeconds * 0.76)),
      summary:
        'Drawing holiday chalk cartoons on the black garage freezer door, sinking a putt under an F-16 afterburner roar at Bridges, and getting busted for “gunfire at the beach” shooting Roman candles with grandson Robert.',
      journalPages: ['98', '126', '127', '154', '179', '183', '222'],
    },
    {
      id: 'ch-7',
      index: 'VII',
      title: '“The Dzia Man” — Unfiltered Convictions, COVID Dispatches & Final Reflections',
      startTime: snapToPause(Math.round(durationSeconds * 0.89)),
      summary:
        'Real-time dispatches through 2020–2021, candid thoughts on faith, politics, death (“Gone = 100%, Return = 0%”), and his enduring love for his daughters and grandchildren.',
      journalPages: ['intro-3', '108', '202', '219', '229', '233'],
    },
  ];

  // Conditional support for future .mp4/.webm documentary video (NEVER render an empty video box when null!)
  let video = null;
  if (videoFile) {
    const rawVideoPath = path.join(RAW_MEDIA_DIR, videoFile);
    const ext = path.extname(videoFile).toLowerCase();
    const publicVideoName = `col-buchta-documentary${ext}`;
    await fs.copyFile(rawVideoPath, path.join(OUT_MEDIA_DIR, publicVideoName));
    video = {
      src: `/media/${publicVideoName}`,
      mimeType: ext === '.webm' ? 'video/webm' : 'video/mp4',
      width: 1920,
      height: 1080,
    };
  }

  const manifest = {
    title: 'The Cold War Colonel Who Shot Fireworks',
    subtitle: 'An Archival Audio Documentary on the Life & Handwritten Journal of Col. Robert M. Buchta, USAF',
    audioSrc: `/media/${publicAudioName}`,
    mimeType: 'audio/mp4',
    durationSeconds,
    barCount,
    peaks,
    chapters,
    hasVideo: Boolean(video),
    video,
  };

  await fs.writeFile(DATA_OUT, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(
    `Media manifest built: ${durationSeconds}s (${Math.floor(durationSeconds / 60)}m ${Math.round(durationSeconds % 60)}s), ${barCount} waveform peaks, hasVideo=${manifest.hasVideo}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
