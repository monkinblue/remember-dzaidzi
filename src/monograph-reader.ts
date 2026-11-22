import type { JournalBlock, JournalData, JournalPage } from './types';
import { escapeHtml, formatJournalText, runLocalViewTransition, syncSliderProps } from './utils/dom';

export interface MonographApi {
  openPage: (pageId: string, scrollReaderIntoView?: boolean) => void;
}

export function initMonographReader(data: JournalData): MonographApi {
  const wingsNavEl = document.getElementById('monograph-wings-nav') as HTMLElement;
  const readerShell = document.getElementById('folio-reader-shell') as HTMLElement;
  const bookStage = document.getElementById('folio-book-stage') as HTMLElement;
  const ledgerStage = document.getElementById('folio-ledger-stage') as HTMLElement;
  const scrubberBar = document.getElementById('folio-scrubber-bar') as HTMLElement;

  const modeTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-reader-mode]'));
  const prevBtn = document.getElementById('folio-prev-btn') as HTMLButtonElement;
  const nextBtn = document.getElementById('folio-next-btn') as HTMLButtonElement;
  const pageSelect = document.getElementById('folio-page-select') as HTMLSelectElement;
  const rangeSlider = document.getElementById('folio-range-slider') as HTMLInputElement;
  const positionReadout = document.getElementById('folio-position-readout') as HTMLElement;

  const paperBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-paper-choice]'));
  const scaleBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-type-scale]'));

  // Cross-reference popover elements
  const xrefPopover = document.getElementById('xref-popover') as HTMLElement & {
    showPopover?: (opts?: { source?: HTMLElement }) => void;
    hidePopover?: () => void;
  };
  const xrefTitle = document.getElementById('xref-popover-title') as HTMLElement;
  const xrefTopic = document.getElementById('xref-popover-topic') as HTMLElement;
  const xrefExcerpt = document.getElementById('xref-popover-excerpt') as HTMLElement;
  const xrefJumpBtn = document.getElementById('xref-popover-jump') as HTMLButtonElement;
  const xrefCloseBtn = document.getElementById('xref-popover-close') as HTMLButtonElement;

  // Concordance elements
  const concordanceInput = document.getElementById('concordance-input') as HTMLInputElement;
  const concordanceClearBtn = document.getElementById('concordance-clear-btn') as HTMLButtonElement;
  const entitiesContainer = document.getElementById('concordance-entities') as HTMLElement;
  const concordanceStatus = document.getElementById('concordance-status') as HTMLElement;
  const concordanceResults = document.getElementById('concordance-results') as HTMLElement;

  const pageById = new Map<string, JournalPage>();
  data.pages.forEach((p) => pageById.set(p.id, p));

  let currentOrder = 0; // Starts at Intro Page 1 (order 0) or Page 9
  let readerMode: 'single' | 'spread' | 'ledger' = 'single';
  let activeEntityId: string | null = data.entities[0]?.id ?? null;

  // Populate direct page <select>
  pageSelect.innerHTML = data.pages
    .map((p) => {
      const shortTopic = p.topic.length > 48 ? `${p.topic.slice(0, 46)}…` : p.topic;
      return `<option value="${p.order}">${escapeHtml(p.label)} — ${escapeHtml(shortTopic)}</option>`;
    })
    .join('');

  rangeSlider.max = String(data.pages.length - 1);
  syncSliderProps(rangeSlider);

  function renderBlocksHtml(blocks: JournalBlock[]): string {
    return blocks
      .map((b) => {
        if (b.type === 'divider') {
          return '<hr class="leaf-divider" aria-hidden="true" />';
        }
        if (b.type === 'marker') {
          return `<p class="continuation-marker-line">${formatJournalText(b.text || '')}</p>`;
        }
        return `<p>${formatJournalText(b.text || '')}</p>`;
      })
      .join('');
  }

  function renderLeafHtml(page: JournalPage): string {
    // Build inline stitched continuations (seamlessly expanded so multi-page stories read naturally!)
    const continuationsHtml = page.continuations
      .map((cont) => {
        if (cont.role === 'swapped' && cont.partnerPageId && cont.partnerBlocks) {
          return `
            <aside class="stitched-continuation-box" aria-label="${escapeHtml(cont.title)}">
              <div class="stitch-header">
                <span class="stitch-badge">⇄ Archival Restoration · ${escapeHtml(cont.title)}</span>
                <button type="button" class="xref-chip" data-goto-folio="${escapeHtml(cont.partnerPageId)}">
                  Inspect ${escapeHtml(cont.partnerLabel || '')} →
                </button>
              </div>
              <p class="stitch-note">${escapeHtml(cont.note)}</p>
              <details open>
                <summary class="stitch-badge" style="cursor:pointer">
                  Read Intended Response for This Prompt (Written on ${escapeHtml(cont.partnerLabel || '')})
                </summary>
                <div class="stitch-segment">
                  <div class="leaf-prose">${renderBlocksHtml(cont.partnerBlocks)}</div>
                </div>
              </details>
            </aside>
          `;
        }

        if (cont.role === 'origin' && cont.downstream && cont.downstream.length > 0) {
          const segmentsHtml = cont.downstream
            .map(
              (seg) => `
              <div class="stitch-segment">
                <div class="stitch-segment-bar">
                  <span>Continued on ${escapeHtml(seg.label)}</span>
                  <button type="button" class="xref-chip" data-goto-folio="${escapeHtml(seg.pageId)}">
                    Turn to ${escapeHtml(seg.label)} →
                  </button>
                </div>
                <div class="leaf-prose">${renderBlocksHtml(seg.blocks)}</div>
              </div>
            `
            )
            .join('');

          return `
            <aside class="stitched-continuation-box" aria-label="Inline continuation: ${escapeHtml(cont.title)}">
              <div class="stitch-header">
                <span class="stitch-badge">↳ Seamless Inline Continuation · ${escapeHtml(cont.title)}</span>
              </div>
              <p class="stitch-note">${escapeHtml(cont.note)}</p>
              <details open>
                <summary class="stitch-badge" style="cursor:pointer">
                  Stitched Continuation (${cont.downstream.map((d) => escapeHtml(d.label)).join(' → ')})
                </summary>
                ${segmentsHtml}
              </details>
            </aside>
          `;
        }

        if (cont.role === 'continuation' && cont.originPageId) {
          return `
            <aside class="stitched-continuation-box" aria-label="Story origin reference">
              <div class="stitch-header">
                <span class="stitch-badge">↰ Continues Earlier Entry (${escapeHtml(cont.originLabel || '')})</span>
                <button type="button" class="xref-chip" data-goto-folio="${escapeHtml(cont.originPageId)}">
                  Read Beginning on ${escapeHtml(cont.originLabel || '')} →
                </button>
              </div>
              <p class="stitch-note">${escapeHtml(cont.note)}</p>
            </aside>
          `;
        }

        return '';
      })
      .join('');

    // COVID-19 Multi-Year Chronicle Ribbon
    let covidRibbonHtml = '';
    if (page.isCovidChronicle) {
      const chips = data.meta.covidChroniclePages
        .map((cid) => {
          const active = cid === page.id;
          return `<button type="button" class="xref-chip" ${
            active ? 'aria-current="page" style="font-weight:700"' : ''
          } data-goto-folio="${escapeHtml(cid)}">p. ${escapeHtml(cid)}</button>`;
        })
        .join('');

      covidRibbonHtml = `
        <aside class="stitched-continuation-box" aria-label="COVID-19 Real-Time Chronicle">
          <div class="stitch-header">
            <span class="stitch-badge">Real-Time Pandemic Dispatch Series (2020–2021)</span>
          </div>
          <p class="stitch-note">
            Eight dated dispatches recorded across the manuscript as events unfolded in real time:
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem">${chips}</div>
        </aside>
      `;
    }

    // Cross-Reference Popover Chips
    let xrefHtml = '';
    if (page.referencedPages.length > 0) {
      const chips = page.referencedPages
        .map((refId) => {
          const refPage = pageById.get(refId);
          if (!refPage) return '';
          return `
            <button
              type="button"
              class="xref-chip"
              data-xref-preview="${escapeHtml(refId)}"
              aria-haspopup="dialog"
            >
              Preview ${escapeHtml(refPage.label)}
            </button>
          `;
        })
        .join('');

      xrefHtml = `
        <div class="leaf-xref-bar">
          <span class="xref-label">${escapeHtml(page.crossRef || 'Cross-References')}:</span>
          ${chips}
        </div>
      `;
    }

    return `
      <article class="folio-leaf" data-folio-id="${escapeHtml(page.id)}">
        <header class="leaf-running-head">
          <span>Wing ${escapeHtml(page.wingRoman)} · ${escapeHtml(page.wingTitle)}</span>
          <span class="leaf-folio-badge">${escapeHtml(page.label)} (Folio ${escapeHtml(page.folioNumber)})</span>
        </header>

        <div class="leaf-prompt-box">
          <span class="leaf-prompt-label">Journal Prompt &amp; Subject</span>
          <h3 class="leaf-prompt-topic">${escapeHtml(page.topic)}</h3>
        </div>

        <div class="leaf-prose">
          ${renderBlocksHtml(page.blocks)}
        </div>

        ${continuationsHtml}
        ${covidRibbonHtml}
        ${xrefHtml}
      </article>
    `;
  }

  function renderWingsNav(): void {
    const activePage = data.pages[currentOrder];
    wingsNavEl.innerHTML = data.wings
      .map((w) => {
        const firstPage = data.pages.find((p) => p.wingId === w.id) || data.pages[0];
        const isCurrent = activePage.wingId === w.id && readerMode !== 'ledger';
        return `
          <button
            type="button"
            class="wing-nav-card ${isCurrent ? 'is-active' : ''}"
            data-wing-jump="${escapeHtml(firstPage.id)}"
          >
            <span class="wing-card-top">
              <span>Wing ${escapeHtml(w.roman)}</span>
              <span>${escapeHtml(w.era)}</span>
            </span>
            <span class="wing-card-title">${escapeHtml(w.title)}</span>
            <span class="wing-card-range">${escapeHtml(w.pageRangeLabel)}</span>
          </button>
        `;
      })
      .join('');
  }

  function renderLedgerOnce(): void {
    if (ledgerStage.dataset.rendered === 'true') return;
    ledgerStage.innerHTML = data.wings
      .map((w) => {
        const wingPages = data.pages.filter((p) => p.wingId === w.id);
        const items = wingPages
          .map(
            (p) => `
            <button type="button" class="ledger-item-btn" data-goto-folio="${escapeHtml(p.id)}">
              <span class="ledger-item-num">${escapeHtml(p.label)} · ${p.wordCount} words</span>
              <span class="ledger-item-topic">${escapeHtml(p.topic)}</span>
            </button>
          `
          )
          .join('');
        return `
          <section class="ledger-wing-block">
            <h3 class="ledger-wing-title">Wing ${escapeHtml(w.roman)}: ${escapeHtml(w.title)} (${escapeHtml(w.era)})</h3>
            <div class="ledger-grid">${items}</div>
          </section>
        `;
      })
      .join('');
    ledgerStage.dataset.rendered = 'true';
  }

  function renderFolio(): void {
    renderWingsNav();

    for (const tab of modeTabs) {
      const sel = tab.dataset.readerMode === readerMode;
      tab.setAttribute('aria-selected', sel ? 'true' : 'false');
    }

    if (readerMode === 'ledger') {
      renderLedgerOnce();
      bookStage.hidden = true;
      scrubberBar.hidden = true;
      ledgerStage.hidden = false;
      return;
    }

    bookStage.hidden = false;
    scrubberBar.hidden = false;
    ledgerStage.hidden = true;

    const step = readerMode === 'spread' ? 2 : 1;
    prevBtn.disabled = currentOrder <= 0;
    nextBtn.disabled = currentOrder + step >= data.pages.length;

    pageSelect.value = String(currentOrder);
    rangeSlider.value = String(currentOrder);
    syncSliderProps(rangeSlider);

    const leftPage = data.pages[currentOrder];
    bookStage.classList.toggle('is-spread', readerMode === 'spread');

    if (readerMode === 'spread' && currentOrder + 1 < data.pages.length) {
      const rightPage = data.pages[currentOrder + 1];
      bookStage.innerHTML = `${renderLeafHtml(leftPage)}${renderLeafHtml(rightPage)}`;
      positionReadout.textContent = `${leftPage.label} – ${rightPage.label} (Leaves ${currentOrder + 1}–${
        currentOrder + 2
      } of ${data.pages.length})`;
    } else {
      bookStage.innerHTML = renderLeafHtml(leftPage);
      positionReadout.textContent = `${leftPage.label} · Wing ${leftPage.wingRoman} (Leaf ${currentOrder + 1} of ${
        data.pages.length
      })`;
    }
  }

  function openPage(pageId: string, scrollReaderIntoView = true): void {
    const cleanId = pageId.replace(/^page-/, '');
    const found = pageById.get(cleanId);
    if (!found) return;

    if (readerMode === 'ledger') {
      readerMode = 'single';
    }

    currentOrder = found.order;
    history.replaceState(null, '', `#page-${found.id}`);

    runLocalViewTransition(() => {
      renderFolio();
    }, scrollReaderIntoView ? bookStage : null);

    if (scrollReaderIntoView) {
      document.getElementById('monograph')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Cross-reference Popover preview
  let activePreviewPageId = '9';

  function openXrefPopover(pageId: string, triggerEl: HTMLElement): void {
    const targetPage = pageById.get(pageId);
    if (!targetPage) return;
    activePreviewPageId = pageId;

    xrefTitle.textContent = `${targetPage.label} (Wing ${targetPage.wingRoman})`;
    xrefTopic.textContent = targetPage.topic;
    const excerpt =
      targetPage.plainText.length > 260 ? `${targetPage.plainText.slice(0, 258)}…` : targetPage.plainText;
    xrefExcerpt.textContent = `“${excerpt}”`;

    if (typeof xrefPopover.showPopover === 'function') {
      try {
        xrefPopover.showPopover({ source: triggerEl });
      } catch {
        xrefPopover.showPopover();
      }
    }
  }

  xrefCloseBtn.addEventListener('click', () => {
    xrefPopover.hidePopover?.();
  });

  xrefJumpBtn.addEventListener('click', () => {
    xrefPopover.hidePopover?.();
    openPage(activePreviewPageId, false);
  });

  // Toolbar events
  modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const next = (tab.dataset.readerMode || 'single') as 'single' | 'spread' | 'ledger';
      if (next === readerMode) return;
      readerMode = next;
      runLocalViewTransition(() => renderFolio());
    });
  });

  prevBtn.addEventListener('click', () => {
    const step = readerMode === 'spread' ? 2 : 1;
    currentOrder = Math.max(0, currentOrder - step);
    runLocalViewTransition(() => renderFolio());
  });

  nextBtn.addEventListener('click', () => {
    const step = readerMode === 'spread' ? 2 : 1;
    currentOrder = Math.min(data.pages.length - 1, currentOrder + step);
    runLocalViewTransition(() => renderFolio());
  });

  pageSelect.addEventListener('change', () => {
    currentOrder = Number(pageSelect.value);
    if (readerMode === 'ledger') readerMode = 'single';
    runLocalViewTransition(() => renderFolio());
  });

  rangeSlider.addEventListener('input', () => {
    currentOrder = Number(rangeSlider.value);
    renderFolio();
  });

  paperBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.paperChoice || 'rag';
      readerShell.setAttribute('data-paper-theme', theme);
      paperBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
  });

  scaleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const scale = btn.dataset.typeScale || 'md';
      readerShell.setAttribute('data-type-scale', scale);
      scaleBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });

  wingsNavEl.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-wing-jump]');
    if (card?.dataset.wingJump) {
      openPage(card.dataset.wingJump, false);
    }
  });

  readerShell.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const gotoBtn = target.closest<HTMLButtonElement>('[data-goto-folio]');
    if (gotoBtn?.dataset.gotoFolio) {
      openPage(gotoBtn.dataset.gotoFolio, false);
      return;
    }
    const previewBtn = target.closest<HTMLButtonElement>('[data-xref-preview]');
    if (previewBtn?.dataset.xrefPreview) {
      openXrefPopover(previewBtn.dataset.xrefPreview, previewBtn);
    }
  });

  // =========================================================================
  // CONCORDANCE & FULL-TEXT SEARCH
  // =========================================================================
  function renderEntities(): void {
    const categories: Array<'Family' | 'Places' | 'Service & Themes'> = [
      'Family',
      'Places',
      'Service & Themes',
    ];

    entitiesContainer.innerHTML = categories
      .map((cat) => {
        const list = data.entities.filter((e) => e.category === cat);
        const pills = list
          .map((ent) => {
            const active = ent.id === activeEntityId && !concordanceInput.value.trim();
            return `
              <button
                type="button"
                class="entity-pill ${active ? 'is-active' : ''}"
                data-entity-id="${escapeHtml(ent.id)}"
              >
                <span>${escapeHtml(ent.label)}</span>
                <span class="entity-count">${ent.pages.length}p</span>
              </button>
            `;
          })
          .join('');

        return `
          <div class="entity-group-row">
            <span class="entity-cat-label">${escapeHtml(cat)}</span>
            ${pills}
          </div>
        `;
      })
      .join('');
  }

  function extractSnippet(text: string, regex: RegExp): string {
    const m = regex.exec(text);
    regex.lastIndex = 0;
    if (!m) {
      const slice = text.slice(0, 175);
      return escapeHtml(slice) + (text.length > 175 ? '…' : '');
    }
    const start = Math.max(0, m.index - 65);
    const end = Math.min(text.length, m.index + m[0].length + 95);
    let snippet = text.slice(start, end);
    if (start > 0) snippet = `…${snippet}`;
    if (end < text.length) snippet = `${snippet}…`;

    const safe = escapeHtml(snippet);
    return safe.replace(regex, (hit) => `<mark>${hit}</mark>`);
  }

  function runConcordance(): void {
    const rawQuery = concordanceInput.value.trim();
    concordanceClearBtn.hidden = rawQuery.length === 0;
    renderEntities();

    if (rawQuery.length > 0) {
      const escapedQ = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedQ, 'gi');
      const hits: Array<{ page: JournalPage; count: number; snippetHtml: string }> = [];
      let totalOccurrences = 0;

      for (const p of data.pages) {
        const combined = `${p.topic} ${p.plainText}`;
        const matches = combined.match(searchRegex);
        if (matches && matches.length > 0) {
          totalOccurrences += matches.length;
          hits.push({
            page: p,
            count: matches.length,
            snippetHtml: extractSnippet(p.plainText, searchRegex),
          });
        }
      }

      concordanceStatus.textContent =
        hits.length > 0
          ? `Found ${totalOccurrences} occurrence${totalOccurrences === 1 ? '' : 's'} of “${rawQuery}” across ${
              hits.length
            } journal page${hits.length === 1 ? '' : 's'}:`
          : `No occurrences of “${rawQuery}” found. Try another keyword or choose an index filter above.`;

      concordanceResults.innerHTML = hits
        .slice(0, 48)
        .map(
          ({ page, count, snippetHtml }) => `
          <article class="concordance-hit-card">
            <div class="hit-top">
              <span>${escapeHtml(page.label)} · Wing ${escapeHtml(page.wingRoman)}</span>
              <span>${count} match${count === 1 ? '' : 'es'}</span>
            </div>
            <h3 class="hit-topic">${escapeHtml(page.topic)}</h3>
            <p class="hit-snippet">${snippetHtml}</p>
            <div>
              <button type="button" class="mini-page-chip" data-concordance-open="${escapeHtml(page.id)}">
                Open ${escapeHtml(page.label)} in Folio →
              </button>
            </div>
          </article>
        `
        )
        .join('');
      return;
    }

    // Otherwise display active Concordance Entity
    const ent = data.entities.find((e) => e.id === activeEntityId) || data.entities[0];
    if (!ent) return;

    const matchedPages = ent.pages.map((pid) => pageById.get(pid)).filter((p): p is JournalPage => Boolean(p));
    concordanceStatus.textContent = `${ent.label} — ${ent.mentions} mentions across ${matchedPages.length} journal pages:`;

    concordanceResults.innerHTML = matchedPages
      .slice(0, 36)
      .map((page) => {
        const preview = page.plainText.slice(0, 165) + (page.plainText.length > 165 ? '…' : '');
        return `
          <article class="concordance-hit-card">
            <div class="hit-top">
              <span>${escapeHtml(page.label)}</span>
              <span>Wing ${escapeHtml(page.wingRoman)}</span>
            </div>
            <h3 class="hit-topic">${escapeHtml(page.topic)}</h3>
            <p class="hit-snippet">${escapeHtml(preview)}</p>
            <div>
              <button type="button" class="mini-page-chip" data-concordance-open="${escapeHtml(page.id)}">
                Open ${escapeHtml(page.label)} in Folio →
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  let debounceTimer: number | undefined;
  concordanceInput.addEventListener('input', () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => runConcordance(), 90);
  });

  concordanceClearBtn.addEventListener('click', () => {
    concordanceInput.value = '';
    concordanceInput.focus();
    runConcordance();
  });

  entitiesContainer.addEventListener('click', (e) => {
    const pill = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-entity-id]');
    if (pill?.dataset.entityId) {
      activeEntityId = pill.dataset.entityId;
      concordanceInput.value = '';
      runConcordance();
    }
  });

  concordanceResults.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-concordance-open]');
    if (btn?.dataset.concordanceOpen) {
      openPage(btn.dataset.concordanceOpen, true);
    }
  });

  renderFolio();
  runConcordance();

  return {
    openPage,
  };
}
