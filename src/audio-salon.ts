import type { AudioChapter, MediaManifest } from './types';
import { escapeHtml, formatTimecode, syncSliderProps } from './utils/dom';

export interface AudioSalonCallbacks {
  onOpenJournalPage: (pageId: string) => void;
}

export function initAudioSalon(manifest: MediaManifest, callbacks: AudioSalonCallbacks) {
  const audio = document.getElementById('documentary-audio') as HTMLAudioElement;
  const playBtn = document.getElementById('salon-play-btn') as HTMLButtonElement;
  const playIcon = document.getElementById('salon-play-icon') as unknown as SVGSVGElement;
  const headerListenBtn = document.getElementById('header-listen-trigger') as HTMLButtonElement;
  const headerListenLabel = document.getElementById('header-listen-label') as HTMLElement;
  const heroPlayBtn = document.getElementById('hero-play-documentary') as HTMLButtonElement;

  const chapterBadge = document.getElementById('salon-chapter-badge') as HTMLElement;
  const chapterTitleEl = document.getElementById('salon-chapter-title') as HTMLElement;
  const currentTimeEl = document.getElementById('salon-current-time') as HTMLElement;
  const totalTimeEl = document.getElementById('salon-total-time') as HTMLElement;
  const hoverReadout = document.getElementById('waveform-hover-readout') as HTMLElement;

  const skipBackBtn = document.getElementById('salon-skip-back') as HTMLButtonElement;
  const skipFwdBtn = document.getElementById('salon-skip-fwd') as HTMLButtonElement;
  const speedBtn = document.getElementById('salon-speed-btn') as HTMLButtonElement;
  const volumeSlider = document.getElementById('salon-volume-slider') as HTMLInputElement;
  const seekSlider = document.getElementById('salon-seek-slider') as HTMLInputElement;

  const waveformStage = document.getElementById('waveform-stage') as HTMLElement;
  const canvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
  const chapterListEl = document.getElementById('salon-chapter-list') as HTMLOListElement;
  const transcriptBodyEl = document.getElementById('salon-transcript-body') as HTMLElement;
  const cinemaMount = document.getElementById('conditional-cinema-mount') as HTMLElement;

  // Persistent Mini-Player elements
  const miniPlayer = document.getElementById('persistent-mini-player') as HTMLElement;
  const miniPlayBtn = document.getElementById('mini-play-btn') as HTMLButtonElement;
  const miniPlayIcon = document.getElementById('mini-play-icon') as unknown as SVGSVGElement;
  const miniProgressFill = document.getElementById('mini-progress-fill') as HTMLElement;
  const miniChapterKicker = document.getElementById('mini-chapter-kicker') as HTMLElement;
  const miniChapterTitle = document.getElementById('mini-chapter-title') as HTMLElement;
  const miniTimecode = document.getElementById('mini-timecode') as HTMLElement;
  const miniSkipBack = document.getElementById('mini-skip-back') as HTMLButtonElement;
  const miniSkipFwd = document.getElementById('mini-skip-fwd') as HTMLButtonElement;
  const miniJumpFolioBtn = document.getElementById('mini-jump-folio-btn') as HTMLButtonElement;
  const miniDismissBtn = document.getElementById('mini-dismiss-btn') as HTMLButtonElement;

  const PLAY_PATH = '<path d="M8 5.5v13l11-6.5z" fill="currentColor" />';
  const PAUSE_PATH = '<path d="M6.5 5h4v14h-4V5zm7 0h4v14h-4V5z" fill="currentColor" />';

  let duration = manifest.durationSeconds;
  let hoverFraction: number | null = null;
  let hasEverPlayed = false;
  let miniDismissed = false;
  let salonVisible = true;
  const speeds = [1, 1.25, 1.5];
  let speedIndex = 0;

  // Initialize duration & sliders
  totalTimeEl.textContent = formatTimecode(duration);
  seekSlider.max = String(Math.round(duration));
  seekSlider.setAttribute('aria-valuetext', `00:00 of ${formatTimecode(duration)}`);
  syncSliderProps(seekSlider);
  syncSliderProps(volumeSlider);
  audio.volume = Number(volumeSlider.value) / 100;

  // Conditional Cinema Video Player (ONLY unlocked if an .mp4/.webm exists in manifest — NEVER an empty box!)
  if (manifest.hasVideo && manifest.video) {
    cinemaMount.hidden = false;
    cinemaMount.innerHTML = `
      <div class="cinema-screening-room">
        <h3 class="chapters-heading">Archival Video Screening Room</h3>
        <video
          controls
          loading="lazy"
          preload="metadata"
          width="${manifest.video.width}"
          height="${manifest.video.height}"
        >
          <source src="${escapeHtml(manifest.video.src)}" type="${escapeHtml(manifest.video.mimeType)}" />
        </video>
      </div>
    `;
  } else {
    cinemaMount.hidden = true;
    cinemaMount.innerHTML = '';
  }

  function getActiveChapter(sec: number): AudioChapter {
    let active = manifest.chapters[0];
    for (const ch of manifest.chapters) {
      if (sec >= ch.startTime) active = ch;
    }
    return active;
  }

  // Render synchronized chapter cards
  chapterListEl.innerHTML = manifest.chapters
    .map((ch, idx) => {
      const chips = ch.journalPages
        .map((pid) => {
          const label = pid.startsWith('intro-') ? `Intro ${pid.split('-')[1]}` : `p. ${pid}`;
          return `<button type="button" class="mini-page-chip" data-chapter-page="${escapeHtml(pid)}">${escapeHtml(label)}</button>`;
        })
        .join('');

      return `
        <li class="salon-chapter-card ${idx === 0 ? 'is-current' : ''}" data-chapter-id="${escapeHtml(ch.id)}">
          <button type="button" class="chapter-card-play" data-seek-time="${ch.startTime}">
            <span class="chapter-card-top">
              <span>Chapter ${escapeHtml(ch.index)}</span>
              <span>${formatTimecode(ch.startTime)}</span>
            </span>
            <span class="chapter-card-title">${escapeHtml(ch.title)}</span>
            <span class="chapter-card-desc">${escapeHtml(ch.summary)}</span>
          </button>
          <div class="chapter-page-chips" aria-label="Cited journal pages">${chips}</div>
        </li>
      `;
    })
    .join('');

  // Render accessible listening guide / source cross-walk
  transcriptBodyEl.innerHTML = `
    <p>
      <strong>Editorial Source Note:</strong> This 51-minute documentary conversation synthesizes Colonel Robert M. Buchta’s complete 233-page handwritten journal verbatim. Every anecdote discussed in the audio can be read word-for-word in the Monograph below:
    </p>
    ${manifest.chapters
      .map(
        (ch) => `
      <p>
        <strong>[${formatTimecode(ch.startTime)}] Chapter ${escapeHtml(ch.index)} — ${escapeHtml(ch.title)}:</strong>
        ${escapeHtml(ch.summary)}
        <em>(Primary manuscript leaves: ${ch.journalPages
          .map((p) => (p.startsWith('intro-') ? `Intro p. ${p.split('-')[1]}` : `p. ${p}`))
          .join(', ')})</em>.
      </p>
    `
      )
      .join('')}
  `;

  // High-DPI Waveform Renderer
  function drawWaveform(): void {
    const rect = waveformStage.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, targetW, targetH);

    const peaks = manifest.peaks;
    const count = peaks.length;
    const progress = duration > 0 ? Math.min(1, Math.max(0, audio.currentTime / duration)) : 0;
    const padX = 12 * dpr;
    const usableW = targetW - padX * 2;
    const step = usableW / count;
    const barW = Math.max(1.5 * dpr, step * 0.64);
    const midY = targetH * 0.54;
    const maxAmpUp = targetH * 0.42;
    const maxAmpDown = targetH * 0.24;

    // Draw subtle chapter tick lines
    ctx.fillStyle = 'rgba(223, 192, 137, 0.22)';
    for (const ch of manifest.chapters) {
      if (ch.startTime <= 0) continue;
      const cx = padX + (ch.startTime / duration) * usableW;
      ctx.fillRect(cx, 6 * dpr, Math.max(1, 1 * dpr), targetH - 12 * dpr);
    }

    // Draw acoustic waveform bars (asymmetric studio reflection style)
    for (let i = 0; i < count; i++) {
      const frac = i / count;
      const amp = peaks[i];
      const x = padX + i * step;
      const hUp = Math.max(2 * dpr, amp * maxAmpUp);
      const hDown = Math.max(1.5 * dpr, amp * maxAmpDown);

      const isPlayed = frac <= progress;
      const isHovered = hoverFraction !== null && frac <= hoverFraction && frac > progress;

      if (isPlayed) {
        ctx.fillStyle = '#dfc089';
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(223, 192, 137, 0.52)';
      } else {
        ctx.fillStyle = 'rgba(190, 198, 214, 0.26)';
      }

      ctx.fillRect(x, midY - hUp, barW, hUp);

      // Subtle lower mirror reflection
      ctx.fillStyle = isPlayed ? 'rgba(200, 162, 101, 0.42)' : 'rgba(190, 198, 214, 0.11)';
      ctx.fillRect(x, midY + 2 * dpr, barW, hDown);
    }

    // Playhead needle
    const playheadX = padX + progress * usableW;
    ctx.fillStyle = '#fff6e4';
    ctx.fillRect(playheadX - 1 * dpr, 4 * dpr, 2 * dpr, targetH - 8 * dpr);
  }

  function updateMiniPlayerVisibility(): void {
    const shouldShow = hasEverPlayed && !miniDismissed && (!salonVisible || !audio.paused);
    miniPlayer.hidden = !shouldShow;
  }

  function syncUI(): void {
    const cur = audio.currentTime || 0;
    const isPlaying = !audio.paused;

    document.body.setAttribute('data-audio-playing', isPlaying ? 'true' : 'false');

    playIcon.innerHTML = isPlaying ? PAUSE_PATH : PLAY_PATH;
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause audio documentary' : 'Play audio documentary');

    miniPlayIcon.innerHTML = isPlaying ? PAUSE_PATH : PLAY_PATH;
    miniPlayBtn.setAttribute('aria-label', isPlaying ? 'Pause audio documentary' : 'Play audio documentary');

    headerListenLabel.textContent = isPlaying ? `Playing · ${formatTimecode(cur)}` : 'Listen · 51:02';

    currentTimeEl.textContent = formatTimecode(cur);
    seekSlider.value = String(Math.round(cur));
    seekSlider.setAttribute('aria-valuetext', `${formatTimecode(cur)} of ${formatTimecode(duration)}`);
    syncSliderProps(seekSlider);

    const activeChapter = getActiveChapter(cur);
    chapterBadge.textContent = `Chapter ${activeChapter.index}`;
    chapterTitleEl.textContent = activeChapter.title;

    miniChapterKicker.textContent = isPlaying
      ? `Playing · Chapter ${activeChapter.index}`
      : `Paused · Chapter ${activeChapter.index}`;
    miniChapterTitle.textContent = activeChapter.title;
    miniTimecode.textContent = `${formatTimecode(cur)} / ${formatTimecode(duration)}`;

    const primaryPage = activeChapter.journalPages[0] || '9';
    const prettyPage = primaryPage.startsWith('intro-')
      ? `Intro ${primaryPage.split('-')[1]} →`
      : `Folio p. ${primaryPage} →`;
    miniJumpFolioBtn.textContent = prettyPage;
    miniJumpFolioBtn.dataset.targetPage = primaryPage;

    const pct = duration > 0 ? Math.min(100, (cur / duration) * 100) : 0;
    miniProgressFill.style.inlineSize = `${pct.toFixed(2)}%`;

    chapterListEl.querySelectorAll<HTMLElement>('.salon-chapter-card').forEach((el) => {
      el.classList.toggle('is-current', el.dataset.chapterId === activeChapter.id);
    });

    updateMiniPlayerVisibility();
    drawWaveform();
  }

  async function togglePlay(): Promise<void> {
    if (audio.paused) {
      hasEverPlayed = true;
      miniDismissed = false;
      try {
        await audio.play();
      } catch {
        // Ignore user-gesture errors if any
      }
    } else {
      audio.pause();
    }
    syncUI();
  }

  function seekTo(sec: number, autoPlay = false): void {
    const clamped = Math.max(0, Math.min(duration, sec));
    audio.currentTime = clamped;
    if (autoPlay && audio.paused) {
      hasEverPlayed = true;
      miniDismissed = false;
      void audio.play();
    }
    syncUI();
  }

  // Event listeners
  playBtn.addEventListener('click', () => void togglePlay());
  miniPlayBtn.addEventListener('click', () => void togglePlay());

  headerListenBtn.addEventListener('click', () => {
    if (!hasEverPlayed) {
      document.getElementById('listening-salon')?.scrollIntoView({ behavior: 'smooth' });
    }
    void togglePlay();
  });

  heroPlayBtn.addEventListener('click', () => {
    document.getElementById('listening-salon')?.scrollIntoView({ behavior: 'smooth' });
    if (audio.paused) void togglePlay();
  });

  skipBackBtn.addEventListener('click', () => seekTo(audio.currentTime - 15));
  skipFwdBtn.addEventListener('click', () => seekTo(audio.currentTime + 15));
  miniSkipBack.addEventListener('click', () => seekTo(audio.currentTime - 15));
  miniSkipFwd.addEventListener('click', () => seekTo(audio.currentTime + 15));

  speedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % speeds.length;
    const rate = speeds[speedIndex];
    audio.playbackRate = rate;
    speedBtn.textContent = `${rate}×`;
    speedBtn.setAttribute('aria-label', `Playback speed ${rate}x, activate to change speed`);
  });

  volumeSlider.addEventListener('input', () => {
    audio.volume = Number(volumeSlider.value) / 100;
    syncSliderProps(volumeSlider);
  });

  seekSlider.addEventListener('input', () => {
    seekTo(Number(seekSlider.value));
  });

  waveformStage.addEventListener('pointermove', (e) => {
    const r = waveformStage.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    hoverFraction = frac;
    const hoverSec = frac * duration;
    const ch = getActiveChapter(hoverSec);
    hoverReadout.textContent = `→ ${formatTimecode(hoverSec)} · Ch. ${ch.index}`;
    drawWaveform();
  });

  waveformStage.addEventListener('pointerleave', () => {
    hoverFraction = null;
    hoverReadout.textContent = '';
    drawWaveform();
  });

  chapterListEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const pageChip = target.closest<HTMLButtonElement>('[data-chapter-page]');
    if (pageChip && pageChip.dataset.chapterPage) {
      callbacks.onOpenJournalPage(pageChip.dataset.chapterPage);
      return;
    }
    const playTrigger = target.closest<HTMLButtonElement>('[data-seek-time]');
    if (playTrigger && playTrigger.dataset.seekTime !== undefined) {
      seekTo(Number(playTrigger.dataset.seekTime), true);
    }
  });

  miniJumpFolioBtn.addEventListener('click', () => {
    const targetPage = miniJumpFolioBtn.dataset.targetPage || '9';
    callbacks.onOpenJournalPage(targetPage);
  });

  miniDismissBtn.addEventListener('click', () => {
    miniDismissed = true;
    audio.pause();
    updateMiniPlayerVisibility();
  });

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duration = audio.duration;
      totalTimeEl.textContent = formatTimecode(duration);
      seekSlider.max = String(Math.round(duration));
      syncSliderProps(seekSlider);
      syncUI();
    }
  });

  audio.addEventListener('timeupdate', syncUI);
  audio.addEventListener('play', syncUI);
  audio.addEventListener('pause', syncUI);
  audio.addEventListener('ended', syncUI);

  // Track whether main salon is on-screen so persistent mini-player docks intelligently
  const salonSection = document.getElementById('listening-salon');
  if (salonSection && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          salonVisible = entry.isIntersecting;
          updateMiniPlayerVisibility();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(salonSection);
  }

  window.addEventListener('resize', () => drawWaveform(), { passive: true });
  requestAnimationFrame(() => drawWaveform());
}
