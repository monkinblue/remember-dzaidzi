import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const JOURNAL_MD = path.join(ROOT, 'content', 'journal.md');
const OUT_JSON = path.join(ROOT, 'src', 'data', 'journal.json');

function pageHeadingToId(heading) {
  const introMatch = heading.match(/^Intro Page (\d+)$/i);
  if (introMatch) return `intro-${introMatch[1]}`;
  const pageMatch = heading.match(/^Page (\d+)$/i);
  if (pageMatch) return pageMatch[1];
  throw new Error(`Unexpected heading: ${heading}`);
}

function parseReferencedPageIds(crossRefText, bodyText, selfId) {
  const ids = new Set();
  const combined = `${crossRefText || ''} ${bodyText || ''}`;

  if (/Intro Page 3/i.test(combined)) ids.add('intro-3');
  if (/Intro Page 1/i.test(combined)) ids.add('intro-1');
  if (/Intro Page 2/i.test(combined)) ids.add('intro-2');

  // Match ranges like pp. 235–237 or 202-203
  const rangeRegex = /(?:pp?\.?|pages?)\s*(\d{1,3})\s*[–-]\s*(\d{1,3})/gi;
  let m;
  while ((m = rangeRegex.exec(combined)) !== null) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 9 && b <= 238 && b >= a && b - a <= 10) {
      for (let p = a; p <= b; p++) ids.add(String(p));
    }
  }

  // Match lists and single references like p. 82, pg 19, page 226, pp. 151 & 158, pp. 161, 162, 164
  const singleRegex = /(?:pp?\.?|pg\.?|pages?)\s*(\d{1,3}(?:\s*(?:,|&|and)\s*\d{1,3})*)/gi;
  while ((m = singleRegex.exec(combined)) !== null) {
    const nums = m[1].match(/\d{1,3}/g) || [];
    for (const n of nums) {
      const num = Number(n);
      if (num >= 9 && num <= 238) ids.add(String(num));
    }
  }

  ids.delete(selfId);
  return Array.from(ids);
}

function parseBodyBlocks(body) {
  const rawParagraphs = body
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return rawParagraphs.map((p) => {
    if (/^(\*\s*\*\s*\*|---)$/.test(p)) {
      return { type: 'divider' };
    }
    const isContinuationHeader =
      /^(\[?p\]?g?\.?\s*\d+\s*-?\s*cont(?:inued|ined)|\*\[Facing-page|\*\[Bottom|Go to page \d+)/i.test(p) &&
      p.length < 90;
    return {
      type: isContinuationHeader ? 'marker' : 'paragraph',
      text: p,
    };
  });
}

function stripMarkupForSearch(text) {
  return text
    .replace(/<\/?u>/g, '')
    .replace(/\*\[(.*?)\]\*/g, '$1')
    .replace(/\[([a-zA-Z0-9.,'")(-]+)\]/g, '$1')
    .replace(/\\([*])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Explicit continuation chains for seamless inline reading in the Folio Reader
const CONTINUATION_CHAINS = [
  {
    id: 'sencom-career',
    title: 'Air Force A-10 SPO to SenCom & Missile Defense',
    pages: ['82', '234'],
    note: 'Bob’s answer on his proudest work continues from Page 82 onto Page 234 (“Additional Memories”).',
  },
  {
    id: 'swapped-111-159',
    title: 'Swapped Manuscript Leaves (pp. 111 ↔ 159)',
    pages: ['111', '159'],
    isSwapped: true,
    note: 'While writing in the bound journal, Bob accidentally wrote Page 159’s answer on Page 111 and vice versa—noting the swap himself in the margins.',
  },
  {
    id: 'blizzard-hitchhike',
    title: 'Hitchhiking Through a Colorado Blizzard to Monica’s Wedding',
    pages: ['205', '208'],
    note: 'Continues from Page 205 onto the bottom of Page 208.',
  },
  {
    id: 'fireworks-bust',
    title: '“Gunfire at the Beach” — July 4th Fireworks Bust with Robert',
    pages: ['179', '183'],
    note: 'Continues from Page 179 onto the bottom of Page 183.',
  },
  {
    id: 'harvard-tunnel-jury',
    title: 'Murder-Trial Jury Duty & Walking into the Harvard Bus Tunnel',
    pages: ['165', '172'],
    note: 'Continues from Page 165 onto the bottom of Page 172.',
  },
  {
    id: 'tracy-sobriety',
    title: 'Closest Confidant — Overcoming Alcohol with Tracy’s Help',
    pages: ['231', '226'],
    note: 'At the bottom of Page 231, Bob writes “Go to page 226” where he concludes the reflection.',
  },
  {
    id: 'religion-supreme-being',
    title: 'Organized Religion, Man-Made Rules & Belief in a Supreme Being',
    pages: ['108', '235'],
    sectionSlice: { '235': 'top' },
    note: 'Continues from Page 108 onto the top half of Page 235.',
  },
  {
    id: 'monica-creek-jaw',
    title: 'Childhood Broken Bones & Monica’s Fairborn Creek Bike Crash',
    pages: ['109', '237'],
    sectionSlice: { '237': 'bottom' },
    note: 'Continues from Page 109 onto the bottom half of Page 237.',
  },
  {
    id: 'aunt-mary-secret',
    title: 'Family Skeletons & Aunt Mary’s Untold Story',
    pages: ['13', '19'],
    sectionSlice: { '19': 'bottom' },
    note: 'Margin arrow on Page 13 directs the reader to the bottom section of Page 19 (“pg 13 continued”).',
  },
  {
    id: 'ots-enlistment',
    title: 'Quitting Medical School & Becoming an Air Force “90-Day Wonder”',
    pages: ['74', '80'],
    note: 'Page 74 directs to Page 80 for the full story of his Air Force enlistment and OTS commission.',
  },
  {
    id: 'three-page-arc-100',
    title: 'Extended Reflection (pp. 100 → 102 → 103)',
    pages: ['100', '102', '103'],
    note: 'Spans Pages 100, 102, and 103.',
  },
  {
    id: 'three-page-arc-131',
    title: 'Extended Reflection (pp. 131 → 132 → 133)',
    pages: ['131', '132', '133'],
    note: 'Flows across the bottom margins of Pages 132 and 133.',
  },
  {
    id: 'political-dispatch-164',
    title: '2016–2020 Investigations & Impeachment Dispatch (pp. 164 → 235–237)',
    pages: ['164', '235', '236', '237'],
    sectionSlice: { '235': 'bottom', '237': 'top' },
    note: 'Continues from Page 164 across the back “Additional Memories” leaves (pp. 235–237).',
  },
  {
    id: 'redistribution-161',
    title: 'Taxation, Socialism & Two-Class Regimes (pp. 161 → 238)',
    pages: ['161', '238'],
    sectionSlice: { '238': 'bottom' },
    note: 'Continues from Page 161 onto the bottom section of Page 238.',
  },
  {
    id: 'campus-constitution-167',
    title: 'Campus Safe Zones & Constitutional Text (pp. 167 → 238)',
    pages: ['167', '238'],
    sectionSlice: { '238': 'top' },
    note: 'Continues from Page 167 onto the top section of Page 238.',
  },
  {
    id: 'covid-early-151',
    title: 'Spring 2020 COVID-19 Dispatch (pp. 151 → 158)',
    pages: ['151', '158'],
    note: 'Continues from Page 151 onto the bottom of Page 158 (part of the multi-year COVID-19 chronicle).',
  },
  {
    id: 'covid-autumn-203',
    title: 'Autumn 2020 COVID-19 Dispatch (pp. 203 → 202)',
    pages: ['203', '202'],
    note: 'Continues onto the bottom of facing Page 202.',
  },
  {
    id: 'covid-winter-219',
    title: '2020–2021 Pandemic & Vaccine Chronicle (pp. 219 → 224 → 225)',
    pages: ['219', '224', '225'],
    note: 'Flows from Page 219 across Pages 224 and 225.',
  },
  {
    id: 'facing-9-intro3',
    title: 'Vital Statistics & Facing-Page Footnotes (“Whoops” — Luke & Lara)',
    pages: ['9', 'intro-3'],
    note: 'Bob added two footnotes on facing Intro Page 3 naming grandchildren Luke and Lara and clarifying Longina’s 12-12-90 passing date.',
  },
  { id: 'facing-32-33', title: 'Facing-Page Continuation (pp. 32 → 33)', pages: ['32', '33'], note: 'Continues at bottom of facing Page 33.' },
  { id: 'facing-41-40', title: 'Facing-Page Addition (pp. 41 → 40)', pages: ['41', '40'], note: 'Continues at bottom of facing Page 40.' },
  { id: 'facing-129-128', title: 'Facing-Page Continuation (pp. 129 → 128)', pages: ['129', '128'], note: 'Continues onto bottom of facing Page 128.' },
  { id: 'facing-138-139', title: 'Facing-Page Continuation (pp. 138 → 139)', pages: ['138', '139'], note: 'Continues onto bottom of facing Page 139.' },
  { id: 'facing-152-153', title: 'Facing-Page Continuation (pp. 152 → 153)', pages: ['152', '153'], note: 'Continues onto bottom of facing Page 153.' },
  { id: 'facing-175-174', title: 'Facing-Page Continuation (pp. 175 → 174)', pages: ['175', '174'], note: 'Continues onto bottom of facing Page 174.' },
  { id: 'facing-181-180', title: 'Facing-Page Continuation (pp. 181 → 180)', pages: ['181', '180'], note: 'Continues onto bottom of facing Page 180.' },
  { id: 'facing-192-193', title: 'Facing-Page Continuation (pp. 192 → 193)', pages: ['192', '193'], note: 'Continues onto bottom of facing Page 193.' },
  { id: 'facing-212-213', title: 'Facing-Page Continuation (pp. 212 → 213)', pages: ['212', '213'], note: 'Continues onto bottom of facing Page 213.' },
  { id: 'facing-214-215', title: 'Facing-Page Continuation (pp. 214 → 215)', pages: ['214', '215'], note: 'Continues onto bottom of facing Page 215.' },
  { id: 'facing-216-217', title: 'Facing-Page Continuation (pp. 216 → 217)', pages: ['216', '217'], note: 'Continues onto bottom of facing Page 217.' },
];

const COVID_CHRONICLE_PAGES = ['40', '151', '158', '203', '202', '219', '224', '225'];

const WINGS = [
  {
    id: 'dedication-roots',
    roman: 'I',
    title: '41 Elm Street & Binghamton Roots',
    era: '1939 – 1957',
    subtitle: 'Slovak & Rusyn heritage on Mygatt Street, oldest of ten children, St. Cyril’s altar boy, Gannett paper routes, and learning golf from his father.',
    pageRangeLabel: 'Intro pp. i–iii · Pages 9 – 55',
    match: (num, id) => id.startsWith('intro-') || (num >= 9 && num <= 55),
    highlightPages: ['intro-1', '9', '11', '12', '14', '17', '26', '52'],
  },
  {
    id: 'lemoyne-longina',
    roman: 'II',
    title: 'Le Moyne, Longina & Becoming a “90-Day Wonder”',
    era: '1957 – 1965',
    subtitle: 'Biology at Le Moyne on a Gannett scholarship, meeting Longina Fisch at a 22nd child’s baptism, walking away from medical school, and earning gold bars at Lackland OTS.',
    pageRangeLabel: 'Pages 56 – 74',
    match: (num) => num >= 56 && num <= 74,
    highlightPages: ['56', '58', '63', '67', '69', '70', '74'],
  },
  {
    id: 'air-force-colonel',
    roman: 'III',
    title: 'Flight Test, The A-10 Warthog & Full Bull Colonel',
    era: '1962 – 1999',
    subtitle: '1st Combat Applications Group test missions at Eglin, earning his RPI master’s, leading the A-10 30mm GAU-8 tank-killer ammo program, attaining O-6 Colonel, and 13 years at SenCom.',
    pageRangeLabel: 'Pages 75 – 96 & 232, 234',
    match: (num) => num >= 75 && num <= 96,
    highlightPages: ['75', '78', '80', '81', '82', '92', '232', '234'],
  },
  {
    id: 'loss-resilience-tracy',
    roman: 'IV',
    title: 'Grief, Resilience & Maple Bluff with Tracy',
    era: '1990 – 2021',
    subtitle: 'Losing Longina at 50, surviving life’s storms, finding love anew with Tracy at SenCom, Cape Cod vows at the Quarterdeck, and home at 328 Lakewood Blvd.',
    pageRangeLabel: 'Pages 97 – 130',
    match: (num) => num >= 97 && num <= 130,
    highlightPages: ['98', '104', '108', '109', '115', '121', '126', '127'],
  },
  {
    id: 'dzias-world',
    roman: 'V',
    title: 'Dzia’s World: Chalk Art, Golf, Markets & Wit',
    era: 'Family & Passions',
    subtitle: 'Holiday chalk cartoons on the garage freezer door, MARGA golf under F-16 afterburners, beating Wall Street, fireworks on the beach, and unfiltered convictions.',
    pageRangeLabel: 'Pages 131 – 195',
    match: (num) => num >= 131 && num <= 195,
    highlightPages: ['154', '157', '165', '172', '179', '183', '186'],
  },
  {
    id: 'covid-final-reflections',
    roman: 'VI',
    title: 'Real-Time History: COVID Dispatches & Final Reflections',
    era: '2019 – 2021',
    subtitle: 'Chronicles written in real time as COVID-19 unfolded, walking Monica down the aisle after a blizzard hitchhike, sobriety with Tracy’s help, life-expectancy math at 80, and Additional Memories.',
    pageRangeLabel: 'Pages 196 – 238',
    match: (num) => num >= 196 && num <= 238,
    highlightPages: ['202', '205', '208', '219', '222', '231', '232', '233'],
  },
];

const CONCORDANCE_ENTITIES = [
  { id: 'tracy', label: 'Tracy (Miller) Buchta', category: 'Family', regex: /\bTracy\b/gi },
  { id: 'longina', label: 'Longina (Fisch) Buchta', category: 'Family', regex: /\bLongina\b/gi },
  { id: 'monica', label: 'Monica (Daughter)', category: 'Family', regex: /\bMonica\b/gi },
  { id: 'stephanie', label: 'Stephanie (Daughter)', category: 'Family', regex: /\bStephanie\b/gi },
  { id: 'robert-grandson', label: 'Robert (Grandson)', category: 'Family', regex: /\bRobert\b/g },
  { id: 'gina', label: 'Gina (Granddaughter)', category: 'Family', regex: /\bGina\b/g },
  { id: 'luke', label: 'Luke (Grandson)', category: 'Family', regex: /\bLuke\b/g },
  { id: 'lara', label: 'Lara (Granddaughter)', category: 'Family', regex: /\bLara\b/g },
  { id: 'parents', label: 'Mom & Dad (Pauline & Martin)', category: 'Family', regex: /\b(Pauline|Perchinsky|Ozalid|Mygatt)\b/gi },
  { id: 'dick', label: 'Brother Dick (Richard)', category: 'Family', regex: /\b(brother Dick|\bDick\b)/g },
  { id: 'joy', label: 'Joy (Tracy’s Mother)', category: 'Family', regex: /\bJoy\b/g },
  { id: 'millie', label: 'Millie & Sissy (Dogs)', category: 'Family', regex: /\b(Millie|Sissy|Caroline)\b/g },
  { id: 'binghamton', label: 'Binghamton & 41 Elm St.', category: 'Places', regex: /\b(Binghamton|Elm St|Mygatt|Endicott|Johnson City)\b/gi },
  { id: 'syracuse-lemoyne', label: 'Le Moyne & Syracuse', category: 'Places', regex: /\b(Le Moyne|LeMoyne|Syracuse)\b/gi },
  { id: 'eglin-hurlburt', label: 'Eglin AFB & Hurlburt Field', category: 'Places', regex: /\b(Eglin|Hurlburt|Fort Walton)\b/gi },
  { id: 'wright-patterson', label: 'Wright-Patterson & Fairborn', category: 'Places', regex: /\b(Wright-Patterson|Wright Patterson|Fairborn|Dayton)\b/gi },
  { id: 'hanscom-bedford', label: 'Hanscom AFB, Bedford & Boston', category: 'Places', regex: /\b(Hanscom|Bedford|Acton|Harvard|Boston)\b/gi },
  { id: 'cape-cod', label: 'Cape Cod, Falmouth & Woods Hole', category: 'Places', regex: /\b(Cape Cod|Falmouth|Woods Hole|Quarterdeck)\b/gi },
  { id: 'madison', label: 'Madison & 328 Lakewood Blvd', category: 'Places', regex: /\b(Madison|Lakewood|Maple Bluff|Wisconsin|Badger|Packers)\b/gi },
  { id: 'a10-warthog', label: 'A-10 Aircraft & 30mm GAU-8', category: 'Service & Themes', regex: /\b(A-10|GAU-8|30\s*mm|Systems Command|colonel|OTS)\b/gi },
  { id: 'sencom-bmdo', label: 'SenCom, Lockheed & Missile Defense', category: 'Service & Themes', regex: /\b(SenCom|Lockheed|BMDO|ballistic missile|Fred Yates)\b/gi },
  { id: 'golf-marga', label: 'Golf, Bridges & MARGA', category: 'Service & Themes', regex: /\b(golf|golfing|golfer|Bridges|Monona|MARGA|putt|birdie|hole-in-one)\b/gi },
  { id: 'chalk-art', label: 'Chalk Art & Garage Freezer Door', category: 'Service & Themes', regex: /\b(chalk|chalkboard|freezer|cartoon|drawings?)\b/gi },
  { id: 'stocks-investing', label: 'Stock Market & Investing', category: 'Service & Themes', regex: /\b(stock market|stocks|invest|Fidelity|dividend|Wall Street)\b/gi },
  { id: 'covid-19', label: 'COVID-19 Dispatches', category: 'Service & Themes', regex: /\b(COVID|corona|virus|pandemic|vaccine|Wuhan|lockdown)\b/gi },
  { id: 'hugh-dziaism', label: '“Hugh” (Signature Dzia Spelling)', category: 'Service & Themes', regex: /\bhugh\b/gi },
];

const CURATED_SPOTLIGHTS = [
  {
    id: 'spotlight-elm-st',
    eyebrow: 'Binghamton, NY · 1939–1957',
    title: 'Oldest of Ten on 41 Elm Street & The Gannett Paperboy',
    quote:
      '“None of my parent’s furniture survived the holocaust of 10 children… The one sport I learned to play from my dad (thank you so much dad) was golf — and I cherish playing it now (at 80).”',
    summary:
      'Born July 15, 1939 to Slovak and Rusyn parents, Bob delivered the Binghamton Press through upstate New York winters, scrambled in the dark for Grandma Perchinsky’s tossed coins on Orthodox Christmas, and won a coveted Frank Gannett Newspaperboy Scholarship to Le Moyne College.',
    pageId: '12',
    relatedPages: ['11', '14', '18', '52', '56'],
  },
  {
    id: 'spotlight-longina-ots',
    eyebrow: 'Syracuse & Lackland AFB · 1961–1962',
    title: 'A 22nd Child’s Baptism, Leaving Med School & Becoming a “90-Day Wonder”',
    quote:
      '“I had one definite goal when I joined the military — it was to become an O-6, a full colonel, not a lieutenant colonel but a full colonel.”',
    summary:
      'Bob met Longina Fisch at the baptism of her cousin’s 22nd child. Realizing in spring 1962 that medicine wasn’t his calling, he married Longina that July, entered Air Force Officer Training School, and was commissioned a 2nd Lieutenant on December 21, 1962.',
    pageId: '232',
    relatedPages: ['10', '67', '70', '74', '80'],
  },
  {
    id: 'spotlight-a10',
    eyebrow: 'Eglin AFB & Wright-Patterson · 1963–1987',
    title: 'Jungle Flare Test Flights & The A-10 “Tank-Killer” 30mm Program',
    quote:
      '“That decision opened the door to my most meaningful contribution to the Air Force. That as a Program Manager for the ammunition for the A-10 aircraft — the success of which made the A-10 a ‘champion’ for our ground combat troops.”',
    summary:
      'After flying counterinsurgency weapons tests aboard C-130s and A-1 Skyraiders in the 1st Combat Applications Group and earning an RPI master’s degree, Bob managed the 30mm GAU-8 depleted-uranium ammunition program that gave the A-10 Warthog its legendary armor-piercing punch.',
    pageId: '82',
    relatedPages: ['75', '78', '81', '232', '234'],
  },
  {
    id: 'spotlight-blizzard',
    eyebrow: 'Colorado Springs · Wedding Eve',
    title: 'Hitchhiking Through a Record Blizzard to Walk Monica Down the Aisle',
    quote:
      '“With runways buried and highways closed, nothing on earth was going to keep him from walking his daughter down the aisle.”',
    summary:
      'Stranded at Denver’s airport by a historic Colorado snowstorm before Monica’s wedding, Bob talked his way into rides through whiteout drifts and stranded snowplows so he would be standing beside his daughter on time.',
    pageId: '205',
    relatedPages: ['208', '104'],
  },
  {
    id: 'spotlight-tracy',
    eyebrow: 'Hanscom, Cape Cod & 328 Lakewood Blvd · 1999–2021',
    title: 'Finding Tracy — Closest Confidant, Guardian Angel & Happiness Road',
    quote:
      '“My wife Tracy is my closest confidant… Tracy was the one who got me to recognize that I was on a path of self destruction. So with her help + my will power I have stopped drinking.”',
    summary:
      'Nine years after losing Longina to breast cancer, Bob fell in love with Tracy Ann Miller—marrying on Cape Cod in 2003, building a joyful life in Maple Bluff, Wisconsin, and crediting Tracy’s candor and love with saving his life in retirement.',
    pageId: '231',
    relatedPages: ['9', '69', '92', '157', '226'],
  },
  {
    id: 'spotlight-fireworks',
    eyebrow: 'July 4th Beach Caper & Bridges Golf Course',
    title: '“Gunfire at the Beach,” F-16 Afterburners & The Freezer-Door Cartoonist',
    quote:
      '“The police arrived responding to reports of ‘gunfire at the beach’ — finding a retired Air Force Colonel and his grandson Robert with Roman candles!”',
    summary:
      'To his grandchildren Robert, Gina, Luke, and Lara, he was “Dzia” and “The Dzia Man”—the grandfather who filled the garage Frigidaire freezer door with hilarious chalk cartoons, drained a long putt as an F-16 roared overhead in full afterburner, and got busted lighting illegal fireworks on the beach with Robert.',
    pageId: '179',
    relatedPages: ['183', '126', '127', '154', '222'],
  },
];

function sliceBlocksForContinuation(blocks, sliceMode) {
  if (!sliceMode) return blocks;
  const dividerIdx = blocks.findIndex((b) => b.type === 'divider');
  if (dividerIdx === -1) return blocks;
  if (sliceMode === 'top') return blocks.slice(0, dividerIdx);
  if (sliceMode === 'bottom') return blocks.slice(dividerIdx + 1);
  return blocks;
}

async function main() {
  const md = await fs.readFile(JOURNAL_MD, 'utf8');
  const rawSections = md.split(/\n---\r?\n(?=## (?:Intro Page|Page) )/).slice(1);

  if (rawSections.length !== 233) {
    throw new Error(`Expected 233 journal sections, found ${rawSections.length}`);
  }

  const pages = [];
  const pageMap = new Map();

  for (let idx = 0; idx < rawSections.length; idx++) {
    const sec = rawSections[idx].trim();
    const lines = sec.split('\n');
    const headingLine = lines[0].replace(/^##\s+/, '').trim();
    const id = pageHeadingToId(headingLine);

    const topicMatch = sec.match(/^- \*\*Prompt Topic:\*\*\s*(.+)$/m);
    const crossRefMatch = sec.match(/^- \*\*Cross-References:\*\*\s*(.+)$/m);

    // Body starts after metadata bullets
    let bodyStartIdx = 1;
    while (bodyStartIdx < lines.length && (lines[bodyStartIdx].startsWith('- **') || lines[bodyStartIdx].trim() === '')) {
      bodyStartIdx++;
    }
    const bodyRaw = lines.slice(bodyStartIdx).join('\n').trim();
    const blocks = parseBodyBlocks(bodyRaw);
    const plainText = stripMarkupForSearch(bodyRaw);
    const words = plainText ? plainText.split(/\s+/).length : 0;

    const numericPage = id.startsWith('intro-') ? Number(id.split('-')[1]) : Number(id);
    const folioNumber =
      id === 'intro-1' ? 'i' : id === 'intro-2' ? 'ii' : id === 'intro-3' ? 'iii' : String(numericPage);

    const crossRefRaw = crossRefMatch ? crossRefMatch[1].trim() : 'None';
    const referencedPages = parseReferencedPageIds(
      crossRefRaw === 'None' ? '' : crossRefRaw,
      bodyRaw,
      id
    );

    const wing = WINGS.find((w) => w.match(numericPage, id)) || WINGS[WINGS.length - 1];

    const pageObj = {
      order: idx,
      id,
      label: headingLine,
      folioNumber,
      numericPage,
      wingId: wing.id,
      wingRoman: wing.roman,
      wingTitle: wing.title,
      topic: topicMatch ? topicMatch[1].trim() : '',
      crossRef: crossRefRaw === 'None' ? null : crossRefRaw,
      referencedPages,
      isCovidChronicle: COVID_CHRONICLE_PAGES.includes(id),
      wordCount: words,
      blocks,
      plainText,
      continuations: [],
    };

    pages.push(pageObj);
    pageMap.set(id, pageObj);
  }

  // Attach bidirectional inline continuation metadata so readers can expand multi-page stories in-place!
  for (const chain of CONTINUATION_CHAINS) {
    for (let i = 0; i < chain.pages.length; i++) {
      const pid = chain.pages[i];
      const page = pageMap.get(pid);
      if (!page) continue;

      if (chain.isSwapped) {
        const partnerId = chain.pages[0] === pid ? chain.pages[1] : chain.pages[0];
        const partner = pageMap.get(partnerId);
        page.continuations.push({
          chainId: chain.id,
          role: 'swapped',
          title: chain.title,
          note: chain.note,
          partnerPageId: partnerId,
          partnerLabel: partner.label,
          partnerTopic: partner.topic,
          partnerBlocks: partner.blocks,
        });
      } else if (i === 0) {
        // Entry page of a multi-page thread: attach all downstream continuation segments!
        const downstream = chain.pages.slice(1).map((targetId) => {
          const tp = pageMap.get(targetId);
          const sliceMode = chain.sectionSlice?.[targetId];
          return {
            pageId: targetId,
            label: tp.label,
            blocks: sliceBlocksForContinuation(tp.blocks, sliceMode),
          };
        });
        page.continuations.push({
          chainId: chain.id,
          role: 'origin',
          title: chain.title,
          note: chain.note,
          downstream,
        });
      } else {
        const originId = chain.pages[0];
        const originPage = pageMap.get(originId);
        page.continuations.push({
          chainId: chain.id,
          role: 'continuation',
          title: chain.title,
          note: chain.note,
          originPageId: originId,
          originLabel: originPage.label,
          originTopic: originPage.topic,
        });
      }
    }
  }

  // Build entity concordance index
  const entities = CONCORDANCE_ENTITIES.map((ent) => {
    const matchedPages = [];
    let totalMentions = 0;

    for (const p of pages) {
      const matches = p.plainText.match(ent.regex);
      if (matches && matches.length > 0) {
        // For "Robert", avoid counting Intro Page 2 signature alone as grandson if helpful, or keep all occurrences accurately
        matchedPages.push(p.id);
        totalMentions += matches.length;
      }
    }

    return {
      id: ent.id,
      label: ent.label,
      category: ent.category,
      mentions: totalMentions,
      pages: matchedPages,
    };
  });

  const totalWords = pages.reduce((acc, p) => acc + p.wordCount, 0);

  const output = {
    meta: {
      title: 'The Journal of Colonel Robert “Bob” Martin Buchta, USAF',
      author: 'Colonel Robert “Bob” Martin Buchta, USAF (1939–)',
      monikers: ['Dzia', 'Dziadek', 'The Dzia Man'],
      totalPages: pages.length,
      totalWords,
      covidChroniclePages: COVID_CHRONICLE_PAGES,
    },
    wings: WINGS.map(({ match, ...rest }) => ({
      ...rest,
      pageCount: pages.filter((p) => p.wingId === rest.id).length,
    })),
    spotlights: CURATED_SPOTLIGHTS,
    entities,
    pages,
  };

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(output), 'utf8');
  console.log(
    `Monograph built: ${pages.length} pages, ${totalWords.toLocaleString()} words, ${entities.length} concordance entities -> src/data/journal.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
