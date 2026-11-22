export interface JournalBlock {
  type: 'paragraph' | 'divider' | 'marker';
  text?: string;
}

export interface DownstreamSegment {
  pageId: string;
  label: string;
  blocks: JournalBlock[];
}

export interface PageContinuation {
  chainId: string;
  role: 'origin' | 'continuation' | 'swapped';
  title: string;
  note: string;
  // For 'origin'
  downstream?: DownstreamSegment[];
  // For 'continuation'
  originPageId?: string;
  originLabel?: string;
  originTopic?: string;
  // For 'swapped'
  partnerPageId?: string;
  partnerLabel?: string;
  partnerTopic?: string;
  partnerBlocks?: JournalBlock[];
}

export interface JournalPage {
  order: number;
  id: string;
  label: string;
  folioNumber: string;
  numericPage: number;
  wingId: string;
  wingRoman: string;
  wingTitle: string;
  topic: string;
  crossRef: string | null;
  referencedPages: string[];
  isCovidChronicle: boolean;
  wordCount: number;
  blocks: JournalBlock[];
  plainText: string;
  continuations: PageContinuation[];
}

export interface JournalWing {
  id: string;
  roman: string;
  title: string;
  era: string;
  subtitle: string;
  pageRangeLabel: string;
  highlightPages: string[];
  pageCount: number;
}

export interface CuratedSpotlight {
  id: string;
  eyebrow: string;
  title: string;
  quote: string;
  summary: string;
  pageId: string;
  relatedPages: string[];
}

export interface ConcordanceEntity {
  id: string;
  label: string;
  category: 'Family' | 'Places' | 'Service & Themes';
  mentions: number;
  pages: string[];
}

export interface JournalData {
  meta: {
    title: string;
    author: string;
    monikers: string[];
    totalPages: number;
    totalWords: number;
    covidChroniclePages: string[];
  };
  wings: JournalWing[];
  spotlights: CuratedSpotlight[];
  entities: ConcordanceEntity[];
  pages: JournalPage[];
}

export interface ChalkArtwork {
  order: number;
  id: string;
  title: string;
  caption: string;
  medium: 'freezer-door' | 'framed-slate' | 'porcelain-platter';
  mediumLabel: string;
  occasion: 'christmas' | 'thanksgiving' | 'easter' | 'st-patricks' | 'halloween' | 'family' | 'patriotic';
  occasionLabel: string;
  dateDisplay: string;
  year: number;
  featured: boolean;
  journalRefs: number[];
  curatorialNote: string;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  fullSrc: string;
  thumbWebp: string;
  thumbAvif: string;
}

export interface AudioChapter {
  id: string;
  index: string;
  title: string;
  startTime: number;
  summary: string;
  journalPages: string[];
}

export interface MediaManifest {
  title: string;
  subtitle: string;
  audioSrc: string;
  mimeType: string;
  durationSeconds: number;
  barCount: number;
  peaks: number[];
  chapters: AudioChapter[];
  hasVideo: boolean;
  video: {
    src: string;
    mimeType: string;
    width: number;
    height: number;
  } | null;
}

export interface VaultDescriptor {
  version: number;
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  saltB64: string;
  payloadPath: string;
  assetCount: number;
}

export interface VaultAssetEntry {
  vaultPath: string;
  mimeType: string;
  bytes: number;
}

export interface VaultPayload {
  version: number;
  documentTitle: string;
  editorialSourceNote: string;
  appHtml: string;
  journal: JournalData;
  chalkArt: ChalkArtwork[];
  mediaManifest: MediaManifest;
  assets: Record<string, VaultAssetEntry>;
}
