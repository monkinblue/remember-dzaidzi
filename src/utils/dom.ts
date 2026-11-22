export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats verbatim journal paragraph text into rich archival HTML
 * while preserving original spelling, underlines (`<u>...</u>`), marginalia (`*[...]*`),
 * edge bracket reconstructions (`[x]`), and escaped asterisks (`\*`).
 */
export function formatJournalText(raw: string, highlightRegex?: RegExp | null): string {
  // Tokenize allowed inline constructs before escaping HTML
  const tokens: string[] = [];
  const pushToken = (html: string) => {
    const idx = tokens.length;
    tokens.push(html);
    return `\u0000T${idx}\u0000`;
  };

  let working = raw.replace(/\\\*/g, '*');

  // 1. Editorial / margin notes: *[...]*
  working = working.replace(/\*\[([\s\S]*?)\]\*/g, (_, inner: string) => {
    return pushToken(`<span class="inline-marginalia">${escapeHtml(inner)}</span>`);
  });

  // 2. Author underlines: <u>...</u>
  working = working.replace(/<u>([\s\S]*?)<\/u>/gi, (_, inner: string) => {
    return pushToken(`<u>${escapeHtml(inner)}</u>`);
  });

  // 3. Edge reconstructions: [word]
  working = working.replace(/\[([a-zA-Z0-9.,'")(-]{1,18})\]/g, (_, inner: string) => {
    return pushToken(`<span class="archival-bracket">[${escapeHtml(inner)}]</span>`);
  });

  let escaped = escapeHtml(working);

  if (highlightRegex) {
    escaped = escaped.replace(highlightRegex, (m) => `<mark>${m}</mark>`);
  }

  // Restore tokens
  escaped = escaped.replace(/\u0000T(\d+)\u0000/g, (_, idxStr: string) => {
    return tokens[Number(idxStr)] || '';
  });

  return escaped;
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Syncs range slider custom properties for cross-browser filled track rendering
 * per modern-web-guidance `slider` guide.
 */
export function syncSliderProps(slider: HTMLInputElement): void {
  slider.style.setProperty('--attr-min', slider.min || '0');
  slider.style.setProperty('--attr-max', slider.max || '100');
  slider.style.setProperty('--control-value', slider.value);
}

/**
 * Runtime probe for discrete `display` transition support (catches Firefox bug 1882408)
 * per modern-web-guidance `animate-to-from-top-layer`.
 */
let cachedSupportsDisplayTransition: boolean | undefined;

export function canTransitionDisplay(): boolean {
  if (cachedSupportsDisplayTransition !== undefined) return cachedSupportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedSupportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedSupportsDisplayTransition;
}

export function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();
}

export async function closeDialogGracefully(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 400)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  dialog.close();
}

/**
 * Wraps DOM updates in a View Transition when supported & allowed,
 * keeping `:root` out of local component transitions and routing focus cleanly.
 */
export function runLocalViewTransition(updateDom: () => void, focusTarget?: HTMLElement | null): void {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const docWithVT = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };

  if (!docWithVT.startViewTransition || prefersReduced) {
    updateDom();
    focusTarget?.focus({ preventScroll: true });
    return;
  }

  document.documentElement.setAttribute('data-vt-scope', 'local');
  const transition = docWithVT.startViewTransition(() => {
    updateDom();
  });

  transition.finished.finally(() => {
    document.documentElement.removeAttribute('data-vt-scope');
    focusTarget?.focus({ preventScroll: true });
  });
}
