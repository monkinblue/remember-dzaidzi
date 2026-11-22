import './styles/main.css';

import { initAudioSalon } from './audio-salon';
import { initChalkGallery } from './chalk-gallery';
import { initMonographReader } from './monograph-reader';
import type { JournalData, VaultDescriptor, VaultPayload } from './types';
import { escapeHtml } from './utils/dom';
import {
  clearSavedVaultKeys,
  decryptVaultPayload,
  deriveVaultKey,
  exportVaultKey,
  fetchVaultDescriptor,
  getSavedVaultKeyB64,
  importVaultKey,
  saveVaultKey,
  VaultAssetLoader,
} from './vault';

// Conditionally load Popover & Invoker Commands polyfills ONLY when native support is missing
if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
  void import('@oddbird/popover-polyfill');
}
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  void import('invokers-polyfill');
}

const LOCKED_TITLE = 'RememberDziadzi.com — Private Family Archive';

let activeAbortController: AbortController | null = null;
let activeVaultLoader: VaultAssetLoader | null = null;

function initScrollFallbacks(signal: AbortSignal): void {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  if (!window.CSS?.supports?.('animation-timeline', 'scroll()')) {
    const progressEl = document.getElementById('exhibition-progress');
    if (progressEl) {
      const updateProgress = () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        progressEl.style.transform = `scaleX(${ratio})`;
      };
      window.addEventListener('scroll', updateProgress, { passive: true, signal });
      updateProgress();
    }
  }

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
              window.addEventListener('scroll', onScroll, { passive: true, signal });
              onScroll();
            } else {
              window.removeEventListener('scroll', onScroll);
            }
          }
        },
        { threshold: 0 }
      );
      io.observe(portraitStage);
      signal.addEventListener('abort', () => io.disconnect());
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

function mountExhibition(payload: VaultPayload, aesKey: CryptoKey, onLockRequested: () => void): void {
  const gateEl = document.getElementById('vault-gate') as HTMLElement;
  const rootEl = document.getElementById('exhibition-root') as HTMLElement;

  // Dispose any prior session cleanly
  activeAbortController?.abort();
  activeVaultLoader?.revokeAll();

  const abortController = new AbortController();
  activeAbortController = abortController;
  const { signal } = abortController;

  const vaultLoader = new VaultAssetLoader(aesKey, payload.assets);
  activeVaultLoader = vaultLoader;

  document.title = payload.documentTitle;
  gateEl.hidden = true;
  rootEl.hidden = false;
  rootEl.innerHTML = payload.appHtml;

  // Hydrate portrait plates immediately and observe below-the-fold images
  vaultLoader.hydrateImages(rootEl);

  initScrollFallbacks(signal);
  initPortraitPlateToggle();

  const monograph = initMonographReader(payload.journal);
  const openJournalPageFn = (pid: string) => monograph.openPage(pid, true);

  const chalkGallery = initChalkGallery(payload.chalkArt, vaultLoader, {
    onOpenJournalPage: openJournalPageFn,
  });

  initAudioSalon(
    payload.mediaManifest,
    payload.editorialSourceNote,
    vaultLoader,
    { onOpenJournalPage: openJournalPageFn },
    signal
  );

  renderSpotlights(payload.journal, openJournalPageFn);

  rootEl.querySelectorAll<HTMLButtonElement>('[data-open-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.openPage) {
        monograph.openPage(btn.dataset.openPage, true);
      }
    });
  });

  const lockBtn = document.getElementById('header-lock-btn');
  lockBtn?.addEventListener('click', () => onLockRequested());

  const applyHashRoute = (): boolean => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return false;
    if (hash.startsWith('page-')) {
      monograph.openPage(hash.slice('page-'.length), true);
      return true;
    }
    if (hash.startsWith('chalk-')) {
      chalkGallery.openArtworkById(hash.slice('chalk-'.length));
      return true;
    }
    return false;
  };

  const handledHash = applyHashRoute();
  window.addEventListener('hashchange', () => applyHashRoute(), { signal });

  if (!handledHash) {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.getElementById('main-title')?.focus({ preventScroll: true });
  }
}

function initVaultGate(): void {
  const gateEl = document.getElementById('vault-gate') as HTMLElement;
  const rootEl = document.getElementById('exhibition-root') as HTMLElement;
  const checkingEl = document.getElementById('vault-checking-state') as HTMLElement;
  const form = document.getElementById('vault-form') as HTMLFormElement;
  const passwordInput = document.getElementById('vault-password') as HTMLInputElement;
  const toggleBtn = document.getElementById('toggle-password') as HTMLButtonElement;
  const rememberCheckbox = document.getElementById('vault-remember') as HTMLInputElement;
  const submitBtn = document.getElementById('vault-submit') as HTMLButtonElement;
  const submitLabel = document.getElementById('vault-submit-label') as HTMLElement;
  const errorBox = document.getElementById('vault-error') as HTMLElement;
  const errorText = document.getElementById('vault-error-text') as HTMLElement;
  const statusRegion = document.getElementById('vault-status') as HTMLElement;

  let descriptorPromise: Promise<VaultDescriptor> = fetchVaultDescriptor();
  let isUnlocking = false;

  // Dynamic aria-describedby only while invalid (per modern-web-guidance `validate-input-after-interaction`)
  function showError(message: string): void {
    const errorId = passwordInput.dataset.error || 'vault-error';
    errorText.textContent = message;
    errorBox.hidden = false;
    passwordInput.classList.add('user-invalid-fallback');
    passwordInput.setAttribute('aria-invalid', 'true');
    passwordInput.setAttribute('aria-describedby', errorId);
    statusRegion.textContent = message;
  }

  function clearError(): void {
    errorBox.hidden = true;
    errorText.textContent = '';
    passwordInput.classList.remove('user-invalid-fallback');
    passwordInput.setAttribute('aria-invalid', 'false');
    passwordInput.removeAttribute('aria-describedby');
  }

  function setSubmitting(submitting: boolean): void {
    isUnlocking = submitting;
    // Only disable submit button AFTER valid submission starts to prevent double-posts (per `forms`)
    submitBtn.disabled = submitting;
    submitBtn.setAttribute('aria-busy', submitting ? 'true' : 'false');
    submitLabel.textContent = submitting ? 'Unlocking Archive…' : 'Unlock Family Archive';
  }

  function lockArchive(): void {
    activeAbortController?.abort();
    activeAbortController = null;
    activeVaultLoader?.revokeAll();
    activeVaultLoader = null;

    clearSavedVaultKeys();

    rootEl.innerHTML = '';
    rootEl.hidden = true;
    document.body.removeAttribute('data-audio-playing');
    document.title = LOCKED_TITLE;

    if (window.location.hash) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }

    form.reset();
    passwordInput.type = 'password';
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.setAttribute('aria-label', 'Show passphrase');
    toggleBtn.textContent = 'Show';
    clearError();
    setSubmitting(false);

    checkingEl.hidden = true;
    form.hidden = false;
    gateEl.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    statusRegion.textContent = 'Family archive locked.';
    passwordInput.focus();
  }

  // Accessible Show / Hide Passphrase toggle (per `forms`)
  toggleBtn.addEventListener('click', () => {
    const revealing = passwordInput.type === 'password';
    passwordInput.type = revealing ? 'text' : 'password';
    toggleBtn.setAttribute('aria-pressed', revealing ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', revealing ? 'Hide passphrase' : 'Show passphrase');
    toggleBtn.textContent = revealing ? 'Hide' : 'Show';
    passwordInput.focus();
  });

  // Clear validation error immediately on user input (per `validate-input-after-interaction`)
  passwordInput.addEventListener('input', () => {
    if (passwordInput.getAttribute('aria-invalid') === 'true') {
      clearError();
    }
  });

  // Validate post-interaction on blur if user left an empty required field after touching it
  passwordInput.addEventListener('blur', () => {
    if (passwordInput.value.length > 0 && passwordInput.getAttribute('aria-invalid') === 'true') {
      clearError();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isUnlocking) return;

    const rawPassword = passwordInput.value;
    if (!rawPassword.trim()) {
      showError('Please enter the family passphrase to unlock the archive.');
      passwordInput.focus();
      return;
    }

    clearError();
    setSubmitting(true);
    statusRegion.textContent = 'Verifying passphrase and decrypting archive…';

    try {
      const descriptor = await descriptorPromise;
      const aesKey = await deriveVaultKey(rawPassword, descriptor);
      const payload = await decryptVaultPayload(descriptor, aesKey);
      const keyB64 = await exportVaultKey(aesKey);

      saveVaultKey(descriptor.saltB64, keyB64, rememberCheckbox.checked);
      passwordInput.value = '';
      setSubmitting(false);
      statusRegion.textContent = 'Archive unlocked.';
      mountExhibition(payload, aesKey, lockArchive);
    } catch (err) {
      setSubmitting(false);
      const isNetworkOrMissing =
        err instanceof TypeError || (err instanceof Error && err.message.startsWith('Archive '));
      if (isNetworkOrMissing) {
        descriptorPromise = fetchVaultDescriptor();
        showError('Unable to reach the encrypted archive files. Please check your connection and try again.');
      } else {
        showError('That passphrase did not unlock the archive. Please check the spelling and try again.');
      }
      passwordInput.focus();
      passwordInput.select();
    }
  });

  // Attempt seamless auto-unlock if a valid session/device key already matches the current vault salt
  void (async () => {
    try {
      const descriptor = await descriptorPromise;
      const savedKeyB64 = getSavedVaultKeyB64(descriptor.saltB64);
      if (!savedKeyB64) {
        checkingEl.hidden = true;
        form.hidden = false;
        return;
      }

      checkingEl.hidden = false;
      form.hidden = true;

      const aesKey = await importVaultKey(savedKeyB64);
      const payload = await decryptVaultPayload(descriptor, aesKey);
      mountExhibition(payload, aesKey, lockArchive);
    } catch {
      clearSavedVaultKeys();
      checkingEl.hidden = true;
      form.hidden = false;
    }
  })();
}

initVaultGate();
