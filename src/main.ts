import './styles/main.css';

import rawChalkData from './data/chalk-art.json';
import rawMediaManifest from './data/media-manifest.json';

import { initAudioSalon } from './audio-salon';
import { initChalkGallery } from './chalk-gallery';
import { initMonographReader } from './monograph-reader';
import type { ChalkArtwork, JournalData, MediaManifest } from './types';
import { escapeHtml } from './utils/dom';

// Conditionally load Popover & Invoker Commands polyfills ONLY when native support is missing
// (per modern-web-guidance `declarative-dialog-popover-control` & `dialog`)
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  void import('@oddbird/popover-polyfill');
}
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  void import('invokers-polyfill');
}

const chalkArtworks = rawChalkData as unknown as ChalkArtwork[];
const mediaManifest = rawMediaManifest as unknown as MediaManifest;

function initScrollFallbacks(): void {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  // Fallback for top scroll progress bar when CSS `animation-timeline: scroll()` is unsupported
  // (per modern-web-guidance `scroll-progress-indicator`)
  if (!window.CSS?.supports?.('animation-timeline', 'scroll()')) {
    const progressEl = document.getElementById('exhibition-progress');
    if (progressEl) {
      const updateProgress = () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        progressEl.style.transform = `scaleX(${ratio})`;
      };
      window.addEventListener('scroll', updateProgress, { passive: true });
      updateProgress();
    }
  }

  // Fallback for portrait subtle parallax when CSS `animation-timeline: view()` is unsupported
  // (per modern-web-guidance `parallax-scroll-effects`)
  if (!window.CSS?.supports?.('(animation-timeline: view()) and (animation-range: entry)')) {
    const portraitStage = document.getElementById('portrait-stage');
    const portraitImg = portraitStage?.querySelector<HTMLImageElement>('.portrait-color img');
    if (portraitStage && portraitImg && 'IntersectionObserver' in window) {
      const onScroll = () => {
        const rect = portraitStage.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const pct = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
        portraitImg.style.transform = `scale(${(1.03 - pct * 0.03).toFixed(4)}) translateY(${(pct * 16).toFixed(1)}px)`;
      };
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              window.addEventListener('scroll', onScroll, { passive: true });
              onScroll();
            } else {
              window.removeEventListener('scroll', onScroll);
            }
          }
        },
        { threshold: 0 }
      );
      io.observe(portraitStage);
    }
  }
}

function initPortraitPlateToggle(): void {
  const stage = document.getElementById('portrait-stage');
  const toggleBtn = document.getElementById('portrait-plate-toggle');
  if (!stage || !toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    const isArchival = stage.getAttribute('data-plate') === 'archival';
    const nextArchival = !isArchival;
    stage.setAttribute('data-plate', nextArchival ? 'archival' : 'color');
    toggleBtn.setAttribute('aria-pressed', nextArchival ? 'true' : 'false');
    toggleBtn.textContent = nextArchival ? 'Living Color Plate' : 'Archival Silver Plate';
  });
}

function renderSpotlights(journalData: JournalData, onOpenPage: (pageId: string) => void): void {
  const grid = document.getElementById('spotlights-grid');
  if (!grid) return;

  grid.innerHTML = journalData.spotlights
    .map((sp) => {
      const relatedBtns = sp.relatedPages
        .map(
          (pid) =>
            `<button type="button" class="mini-page-chip" data-spotlight-page="${escapeHtml(pid)}">p. ${escapeHtml(
              pid
            )}</button>`
        )
        .join('');

      return `
        <article class="spotlight-card">
          <p class="spotlight-eyebrow">${escapeHtml(sp.eyebrow)}</p>
          <h3 class="spotlight-title">${escapeHtml(sp.title)}</h3>
          <blockquote class="spotlight-quote">${escapeHtml(sp.quote)}</blockquote>
          <p class="spotlight-summary">${escapeHtml(sp.summary)}</p>
          <footer class="spotlight-footer">
            <button type="button" class="quote-page-chip" data-spotlight-page="${escapeHtml(sp.pageId)}">
              Read p. ${escapeHtml(sp.pageId)} in Folio →
            </button>
            ${relatedBtns}
          </footer>
        </article>
      `;
    })
    .join('');

  grid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-spotlight-page]');
    if (btn?.dataset.spotlightPage) {
      onOpenPage(btn.dataset.spotlightPage);
    }
  });
}

async function bootstrap(): Promise<void> {
  initScrollFallbacks();
  initPortraitPlateToggle();

  let openJournalPageFn: (pid: string) => void = () => {};

  const chalkGallery = initChalkGallery(chalkArtworks, {
    onOpenJournalPage: (pid) => openJournalPageFn(pid),
  });

  initAudioSalon(mediaManifest, {
    onOpenJournalPage: (pid) => openJournalPageFn(pid),
  });

  // Dynamically load the 233-page monograph data chunk so above-the-fold UI interactive bundle stays ultra-lean
  const { default: rawJournalData } = await import('./data/journal.json');
  const journalData = rawJournalData as unknown as JournalData;

  const monograph = initMonographReader(journalData);
  openJournalPageFn = (pid: string) => monograph.openPage(pid, true);

  renderSpotlights(journalData, openJournalPageFn);

  // Wire global `[data-open-page]` triggers (in Dedication & Chalk Curatorial Banner)
  document.querySelectorAll<HTMLButtonElement>('[data-open-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.openPage) {
        monograph.openPage(btn.dataset.openPage, true);
      }
    });
  });

  // Handle initial URL hash deep-linking (`#page-82`, `#page-intro-3`, `#chalk-chablo-chicasso`)
  const applyHashRoute = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    if (hash.startsWith('page-')) {
      monograph.openPage(hash.slice('page-'.length), true);
    } else if (hash.startsWith('chalk-')) {
      chalkGallery.openArtworkById(hash.slice('chalk-'.length));
    }
  };

  applyHashRoute();
  window.addEventListener('hashchange', applyHashRoute);
}

void bootstrap();
