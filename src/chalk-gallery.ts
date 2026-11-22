import type { ChalkArtwork } from './types';
import { closeDialogGracefully, escapeHtml, runLocalViewTransition } from './utils/dom';
import type { VaultAssetLoader } from './vault';

const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface ChalkGalleryCallbacks {
  onOpenJournalPage: (pageId: string) => void;
}

export interface ChalkGalleryApi {
  openArtworkById: (id: string) => void;
}

export function initChalkGallery(
  artworks: ChalkArtwork[],
  vaultLoader: VaultAssetLoader,
  callbacks: ChalkGalleryCallbacks
): ChalkGalleryApi {
  const gridEl = document.getElementById('chalk-gallery-grid') as HTMLElement;
  const statusEl = document.getElementById('chalk-result-status') as HTMLElement;
  const mediumTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-chalk-medium]'));
  const occasionPills = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-chalk-occasion]'));

  const dialog = document.getElementById('chalk-lightbox') as HTMLDialogElement;
  const plateNumEl = document.getElementById('lightbox-plate-num') as HTMLElement;
  const mediumBadgeEl = document.getElementById('lightbox-medium-badge') as HTMLElement;
  const lbImg = document.getElementById('lightbox-img') as HTMLImageElement;
  const lbPanStage = document.getElementById('lightbox-pan-stage') as HTMLElement;
  const lbDate = document.getElementById('lightbox-date') as HTMLElement;
  const lbTitle = document.getElementById('lightbox-title') as HTMLElement;
  const lbCaption = document.getElementById('lightbox-caption') as HTMLElement;
  const lbNote = document.getElementById('lightbox-note') as HTMLElement;
  const lbRefs = document.getElementById('lightbox-refs') as HTMLElement;

  const zoomInBtn = document.getElementById('lb-zoom-in') as HTMLButtonElement;
  const zoomOutBtn = document.getElementById('lb-zoom-out') as HTMLButtonElement;
  const zoomResetBtn = document.getElementById('lb-zoom-reset') as HTMLButtonElement;
  const zoomReadout = document.getElementById('lb-zoom-readout') as HTMLElement;
  const closeBtn = document.getElementById('lb-close-btn') as HTMLButtonElement;
  const prevBtn = document.getElementById('lb-prev-btn') as HTMLButtonElement;
  const nextBtn = document.getElementById('lb-next-btn') as HTMLButtonElement;

  let activeMedium = 'all';
  let activeOccasion = 'all';
  let filteredList: ChalkArtwork[] = [...artworks];
  let activeIndex = 0;
  let lightboxLoadToken = 0;

  // Pan & Zoom state for curatorial lightbox inspection
  let zoomScale = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  function applyTransform(): void {
    if (zoomScale <= 1) {
      panX = 0;
      panY = 0;
    }
    lbImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    zoomReadout.textContent = `${Math.round(zoomScale * 100)}%`;
  }

  function resetZoom(): void {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  function setZoom(next: number): void {
    zoomScale = Math.max(1, Math.min(3.5, Number(next.toFixed(2))));
    applyTransform();
  }

  function renderGrid(): void {
    filteredList = artworks.filter((a) => {
      const mOk = activeMedium === 'all' || a.medium === activeMedium;
      const oOk = activeOccasion === 'all' || a.occasion === activeOccasion;
      return mOk && oOk;
    });

    statusEl.textContent = `Showing ${filteredList.length} of ${artworks.length} preserved artworks · Click any plate for high-resolution curatorial zoom`;

    gridEl.innerHTML = filteredList
      .map((art) => {
        const safeId = escapeHtml(art.id);
        const cachedThumb = vaultLoader.getCachedUrl(art.thumbWebp);
        const imgAttrs = cachedThumb
          ? `src="${cachedThumb}"`
          : `src="${BLANK_IMG}" data-vault-src="${escapeHtml(art.thumbWebp)}"`;

        return `
          <article class="chalk-card" style="view-transition-name: chalk-${safeId}">
            <button type="button" class="chalk-card-trigger" data-open-chalk="${safeId}">
              <div class="chalk-plate-mat">
                <picture>
                  <img
                    ${imgAttrs}
                    alt="${escapeHtml(art.title)} — ${escapeHtml(art.caption)}"
                    width="${art.thumbWidth}"
                    height="${art.thumbHeight}"
                  />
                </picture>
                <span class="chalk-zoom-pill" aria-hidden="true">Inspect ⤢</span>
              </div>
              <div class="chalk-card-body">
                <div class="chalk-card-meta">
                  <span>${escapeHtml(art.occasionLabel)}</span>
                  <span>${escapeHtml(art.dateDisplay)}</span>
                </div>
                <h3 class="chalk-card-title">${escapeHtml(art.title)}</h3>
                <p class="chalk-card-caption">${escapeHtml(art.caption)}</p>
              </div>
            </button>
          </article>
        `;
      })
      .join('');

    vaultLoader.hydrateImages(gridEl);
  }

  function populateLightbox(index: number): void {
    if (filteredList.length === 0) return;
    activeIndex = (index + filteredList.length) % filteredList.length;
    const art = filteredList[activeIndex];
    const token = ++lightboxLoadToken;

    resetZoom();
    plateNumEl.textContent = `Plate ${String(art.order).padStart(2, '0')} / ${artworks.length}`;
    mediumBadgeEl.textContent = art.mediumLabel;
    lbImg.alt = `${art.title}: ${art.caption}`;
    lbImg.width = art.width;
    lbImg.height = art.height;

    const cachedFull = vaultLoader.getCachedUrl(art.fullSrc);
    if (cachedFull) {
      lbImg.src = cachedFull;
    } else {
      lbImg.src = vaultLoader.getCachedUrl(art.thumbWebp) || BLANK_IMG;
      void vaultLoader
        .resolveUrl(art.fullSrc)
        .then((fullBlobUrl) => {
          if (token !== lightboxLoadToken) return;
          lbImg.src = fullBlobUrl;
        })
        .catch(() => {
          // Ignore canceled decryption if archive locks mid-request
        });
    }

    lbDate.textContent = `${art.occasionLabel} · ${art.dateDisplay}`;
    lbTitle.textContent = art.title;
    lbCaption.textContent = art.caption;
    lbNote.textContent = art.curatorialNote;

    lbRefs.innerHTML = art.journalRefs
      .map(
        (p) =>
          `<button type="button" class="quote-page-chip" data-lightbox-journal="${p}">Read Journal p. ${p} →</button>`
      )
      .join('');
  }

  function openLightboxById(id: string): void {
    let idx = filteredList.findIndex((a) => a.id === id);
    if (idx === -1) {
      activeMedium = 'all';
      activeOccasion = 'all';
      syncFilterControls();
      renderGrid();
      idx = filteredList.findIndex((a) => a.id === id);
    }
    if (idx === -1) return;

    populateLightbox(idx);
    if (!dialog.open) {
      dialog.showModal();
    }
  }

  function syncFilterControls(): void {
    for (const tab of mediumTabs) {
      const sel = tab.dataset.chalkMedium === activeMedium;
      tab.setAttribute('aria-selected', sel ? 'true' : 'false');
      tab.tabIndex = sel ? 0 : -1;
    }
    for (const pill of occasionPills) {
      const sel = pill.dataset.chalkOccasion === activeOccasion;
      pill.classList.toggle('is-active', sel);
      pill.setAttribute('aria-pressed', sel ? 'true' : 'false');
    }
  }

  // Medium tabs (selection follows focus + click with View Transitions)
  mediumTabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => {
      const next = tab.dataset.chalkMedium || 'all';
      if (next === activeMedium) return;
      activeMedium = next;
      syncFilterControls();
      runLocalViewTransition(() => renderGrid());
    });

    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const nextIdx = (idx + dir + mediumTabs.length) % mediumTabs.length;
      const targetTab = mediumTabs[nextIdx];
      targetTab.focus();
      targetTab.click();
    });
  });

  // Occasion filter pills
  for (const pill of occasionPills) {
    pill.addEventListener('click', () => {
      const next = pill.dataset.chalkOccasion || 'all';
      activeOccasion = next === activeOccasion && next !== 'all' ? 'all' : next;
      syncFilterControls();
      runLocalViewTransition(() => renderGrid());
    });
  }

  // Grid & Diptych triggers
  gridEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-open-chalk]');
    if (btn?.dataset.openChalk) {
      openLightboxById(btn.dataset.openChalk);
    }
  });

  document.querySelectorAll<HTMLButtonElement>('[data-inspect-chalk]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.inspectChalk) openLightboxById(btn.dataset.inspectChalk);
    });
  });

  // Lightbox controls
  prevBtn.addEventListener('click', () => populateLightbox(activeIndex - 1));
  nextBtn.addEventListener('click', () => populateLightbox(activeIndex + 1));
  zoomInBtn.addEventListener('click', () => setZoom(zoomScale + 0.4));
  zoomOutBtn.addEventListener('click', () => setZoom(zoomScale - 0.4));
  zoomResetBtn.addEventListener('click', () => resetZoom());

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    void closeDialogGracefully(dialog);
  });

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    void closeDialogGracefully(dialog);
  });

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = e.target === dialog && isOutside(e);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && e.target === dialog && isOutside(e)) {
        void closeDialogGracefully(dialog);
      }
      pressedOutside = false;
    });
  }

  lbPanStage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoom(zoomScale + delta);
    },
    { passive: false }
  );

  lbPanStage.addEventListener('dblclick', () => {
    setZoom(zoomScale > 1.2 ? 1 : 2.2);
  });

  lbPanStage.addEventListener('pointerdown', (e) => {
    if (zoomScale <= 1) return;
    isDragging = true;
    dragStartX = e.clientX - panX;
    dragStartY = e.clientY - panY;
    lbPanStage.setPointerCapture(e.pointerId);
  });

  lbPanStage.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - dragStartX;
    panY = e.clientY - dragStartY;
    applyTransform();
  });

  lbPanStage.addEventListener('pointerup', () => {
    isDragging = false;
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      populateLightbox(activeIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      populateLightbox(activeIndex + 1);
    }
  });

  lbRefs.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lightbox-journal]');
    if (btn?.dataset.lightboxJournal) {
      const pid = btn.dataset.lightboxJournal;
      void closeDialogGracefully(dialog).then(() => {
        callbacks.onOpenJournalPage(pid);
      });
    }
  });

  syncFilterControls();
  renderGrid();

  return {
    openArtworkById: openLightboxById,
  };
}
