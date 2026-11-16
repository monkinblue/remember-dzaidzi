import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, 'raw_assets', 'chalk_art');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'chalk');
const DATA_OUT = path.join(ROOT, 'src', 'data', 'chalk-art.json');
const SCRATCH_DIR = 'C:/Users/RobaD/.gemini/antigravity/brain/6a0f938a-3cda-4334-adee-7884234cf29b/scratch';

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Complete curatorial catalog of all 49 unique holiday & family artworks in raw_assets/chalk_art/
 * (48 JPEGs + 1 unique Christmas 2020 COVID-era Scrooge chalk drawing extracted from FullSizeRender.MOV;
 * FullSizeRender-1.MOV is the Live Photo companion to FullSizeRender.JPEG and is deduplicated).
 */
const ARTWORKS = [
  {
    id: 'chablo-chicasso',
    file: 'IMG_6278.JPEG',
    title: 'Eastertime Self-Portrait by Chablo Chicasso',
    caption: 'EASTERTIME SELF-PORTRAIT BY CHABLO CHICASSO (circa 1890)',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'easter',
    occasionLabel: 'Easter & Spring',
    dateDisplay: 'March 2016',
    year: 2016,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 0.99, height: 0.968 },
    deglare: 0.35,
    journalRefs: [127, 154],
    curatorialNote:
      'One of Bob’s most celebrated garage-door masterpieces: a cigarette-smoking Easter chick holding an artist’s palette while painting a striped egg on a wooden easel, signed with Dzia’s unforgettable pun “Chablo Chicasso (circa 1890).”',
  },
  {
    id: 'hoot-hoot-tracy-birthday',
    file: 'IMG_1077.JPEG',
    title: 'Hoot Hoot Hooray — Tracy’s Birthday Owl',
    caption: "HOOT HOOT HOOT HOOT — HOOT HOOT HOORAY IT'S TRACY'S BIRTH-DAY",
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'August 28, 2020',
    year: 2020,
    featured: true,
    crop: { left: 0.005, top: 0.006, width: 0.99, height: 0.98 },
    deglare: 0.3,
    journalRefs: [9, 127, 154, 157],
    curatorialNote:
      'Drawn on the eve of Tracy’s August 29 birthday right beside the white oval FRIGIDAIRE badge on the garage freezer door—complete with rainbow party hat, pink balloon, and wide-eyed owl perched on a heart-leaved branch.',
  },
  {
    id: 'happy-16th-woods-hole',
    file: 'IMG_2286.JPG',
    title: 'Happiness Road — 16th Anniversary to Woods Hole',
    caption: 'HAPPY 16th TRACY · #16 · WOODS HOLE · HAPPINESS ROAD',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'October 2019',
    year: 2019,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.3,
    journalRefs: [9, 69, 92, 157],
    curatorialNote:
      'Celebrating Bob and Tracy’s 16th wedding anniversary (married October 15, 2003 in Falmouth on Cape Cod). Silver-haired Bob and blonde Tracy cruise side-by-side down “Happiness Road” with a “WOODS HOLE” bumper plate.',
  },
  {
    id: 'christmas-grinched',
    file: 'IMG_1768.JPG',
    title: 'Maybe You’ve Been “Grinched” (Part I: Christmas)',
    caption: 'NO GIFTS? ZIP ZERO NADA? MAYBE YOU’VE BEEN NAUGHTY OR MAYBE YOU’VE BEEN “GRINCHED”',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'December 24, 2019',
    year: 2019,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.3,
    journalRefs: [127, 154],
    curatorialNote:
      'Christmas Eve 2019 on the Frigidaire freezer door. Look closely at this Grinch—four months later, Bob refused to erase him and staged one of his funniest visual callbacks (see Part II right next to it).',
  },
  {
    id: 'easter-grinch-callback',
    file: 'IMG_1836.JPEG',
    title: 'And Now Your Easter? (Part II: The Grinch Re-Hatting)',
    caption: 'DISGUSTING LITTLE GRINCH — HE STOLE YOUR CHRISTMAS AND NOW YOUR EASTER?',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Recycled Christmas Chalk Figure',
    occasion: 'easter',
    occasionLabel: 'Easter & Spring',
    dateDisplay: 'April 11, 2020',
    year: 2020,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 0.992, height: 0.985 },
    deglare: 0.35,
    journalRefs: [127, 154, 151],
    curatorialNote:
      'Pure Dzia genius: in April 2020 (the first COVID Easter), Bob kept the exact December 2019 Grinch body untouched, erased only his Santa hat, drew white bunny ears in its place, and accused him of stealing Easter too!',
  },
  {
    id: 'santa-stuck-chimney',
    file: 'IMG_1839.JPG',
    title: 'It Was Not a Silent Night',
    caption: '“HELP! RUDOLPH, HELP!” — IT WAS NOT A SILENT NIGHT',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'December 2018',
    year: 2018,
    featured: true,
    crop: { left: 0.008, top: 0.0, width: 0.988, height: 0.935 },
    deglare: 0.35,
    journalRefs: [127, 154],
    curatorialNote:
      'Santa wedged boots-up in a snow-covered brick chimney beside pine trees under a crescent moon on the Frigidaire door.',
  },
  {
    id: 'off-to-mars-uncle-sam',
    file: 'IMG_0462.JPG',
    title: 'Uncle Sam’s Rocket to Mars',
    caption: "IF AMERICA EMBRACES SOCIALISM I'M OFF TO MARS · USA",
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'patriotic',
    occasionLabel: 'Patriotic, Golf & Wit',
    dateDisplay: 'June 2019',
    year: 2019,
    featured: true,
    crop: { left: 0.0, top: 0.012, width: 1.0, height: 0.968 },
    deglare: 0.35,
    journalRefs: [129, 161, 238],
    curatorialNote:
      'As promised in his Journal preface (“Suprise, suprise!”), Bob never hid his convictions—putting Uncle Sam astride a USA rocket right on the garage freezer door.',
  },
  {
    id: 'go-pack-go-turkey-menu',
    file: 'IMG_5937.JPG',
    title: 'Go Pack Go — Turkey Day Bear Menu',
    caption: 'GO PACK GO · TURKEY DAY MENU: • FILET OF BEAR • BEAR STEW • BEAR BURGER',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'thanksgiving',
    occasionLabel: 'Thanksgiving',
    dateDisplay: 'November 25, 2015',
    year: 2015,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 0.985, height: 0.99 },
    deglare: 0.35,
    journalRefs: [115, 127, 183],
    curatorialNote:
      'Drawn the day before Thanksgiving 2015, when the Green Bay Packers hosted the Chicago Bears at Lambeau Field on Thanksgiving Night.',
  },
  {
    id: 'stop-butterball',
    file: 'IMG_0360.JPG',
    title: 'Stop Butterball — Stop!',
    caption: 'BEHIND ME I HEAR: “STOP BUTTERBALL—STOP!” BUT WHAT’S A FRICKIN BUTTERBALL?',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'thanksgiving',
    occasionLabel: 'Thanksgiving',
    dateDisplay: 'November 2017',
    year: 2017,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.3,
    journalRefs: [127, 154],
    curatorialNote:
      'A panicked turkey sprinting at full tilt while losing its Pilgrim hat—classic Bob comic timing and lettering.',
  },
  {
    id: 'time-for-golf-easter',
    file: 'IMG_2285.JPG',
    title: 'No Way! It’s Time for Golf',
    caption: "Bunnies Chicks? Eggs — NO WAY! IT'S TIME FOR GOLF · WOOOSSSH",
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'patriotic',
    occasionLabel: 'Patriotic, Golf & Wit',
    dateDisplay: 'March 30, 2013',
    year: 2013,
    featured: true,
    crop: { left: 0.004, top: 0.0, width: 0.99, height: 0.908 },
    deglare: 0.45,
    journalRefs: [12, 98, 121, 154],
    curatorialNote:
      'Spring in Madison meant one thing above all else to Bob: getting back onto Bridges and Monona Golf Courses with his MARGA league.',
  },
  {
    id: 'bloody-good-halloween',
    file: 'IMG_1105.jpeg',
    title: 'A Bloody Good Halloveen',
    caption: 'I VANT TO VISH YOU A BLOODY GOOD HALLO-VEEN',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'halloween',
    occasionLabel: 'Halloween',
    dateDisplay: 'October 12, 2020',
    year: 2020,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 0.985 },
    deglare: 0.25,
    journalRefs: [127, 154],
    curatorialNote:
      'Count Dracula in crimson-lined cape with outstretched blue hands greeting visitors in the garage.',
  },
  {
    id: 'we-the-people-liberty',
    file: 'IMG_2274.JPG',
    title: 'We the People Love Our Country',
    caption: 'WE THE PEOPLE LOVE OUR COUNTRY — AND WE WILL CREATE A BETTER LIFE FOR ALL',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'patriotic',
    occasionLabel: 'Patriotic, Golf & Wit',
    dateDisplay: 'July 3, 2020',
    year: 2020,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 0.99, height: 0.985 },
    deglare: 0.3,
    journalRefs: [82, 129, 232],
    curatorialNote:
      'Drawn for Independence Day 2020: Lady Liberty holding her torch high and a tablet inscribed “WE THE PEOPLE.”',
  },
  {
    id: 'scrooge-2020-good-riddance',
    file: 'FullSizeRender.MOV',
    isVideoKeyframe: true,
    title: '2020: Bah Humbug, Good Riddance',
    caption: '2020 · BAH HUMBUG · GOOD RIDDANCE — Sorrow · Stress · Sacrifice · Survival · Isolation · Desporation',
    medium: 'framed-slate',
    mediumLabel: 'Slate Chalkboard (Recovered from Live Photo Motion Clip)',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'December 25, 2020',
    year: 2020,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.25,
    journalRefs: [40, 151, 202, 203, 219, 224, 225],
    curatorialNote:
      'Preserved solely inside a Christmas Day 2020 Live Photo clip: a weary Ebenezer Scrooge bidding farewell to the pandemic year 2020 alongside the six words Bob felt defined it.',
  },
  {
    id: 'center-of-the-table-turkey',
    file: 'FullSizeRender.JPEG',
    title: 'Center of the Table Setting',
    caption: 'WHY IS MY PLACE SETTING IN THE CENTER OF THE TABLE?',
    medium: 'framed-slate',
    mediumLabel: 'Framed Charcoal-Wood Wall Slate',
    occasion: 'thanksgiving',
    occasionLabel: 'Thanksgiving',
    dateDisplay: 'November 26, 2020',
    year: 2020,
    featured: true,
    crop: { left: 0.072, top: 0.026, width: 0.882, height: 0.946 },
    deglare: 0.2,
    journalRefs: [127, 154],
    curatorialNote:
      'A skeptical Thanksgiving turkey wearing a blue neckerchief and holding a carving knife and fork on Bob’s framed indoor chalkboard.',
  },
  {
    id: 'rudy-poem-chalkboard',
    file: 'IMG_4572.JPEG',
    title: 'Rudy & Original Christmas Verse',
    caption: 'RUDY — “My nose it just glows, showing a path for Santa’s sleigh...” (- Rudy)',
    medium: 'framed-slate',
    mediumLabel: 'Framed Wall Slate with Printed Poem & Bottle-Cap Magnets',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'December 12, 2021',
    year: 2021,
    featured: true,
    crop: { left: 0.052, top: 0.036, width: 0.916, height: 0.936 },
    deglare: 0.18,
    journalRefs: [127, 154],
    curatorialNote:
      'Beside his chalk portrait of Rudolph in a Santa cap, Bob pinned an original four-couplet poem signed “- Rudy” held up with bottle-cap magnets.',
  },
  {
    id: 'he-saw-what-you-did-santa',
    file: 'IMG_7544.JPEG',
    title: 'He Saw What You Did!',
    caption: 'he knows if you’ve been bad or good... HE SAW WHAT YOU DID!',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'December 22, 2016',
    year: 2016,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 0.992, height: 0.985 },
    deglare: 0.35,
    journalRefs: [127, 154],
    curatorialNote:
      'A hilariously stern, bushy-browed Santa glaring straight at whoever just walked into the garage beneath a treble-clef musical staff.',
  },
  {
    id: 'witch-birthday-girls-spell',
    file: 'IMG_7392.JPG',
    title: 'Upon Birthday Girls I Will Cast My Spell',
    caption: 'UPON BIRTHDAY GIRLS I WILL CAST MY SPELL · WHAT HAPPENS NEXT I SHALL NEVER TELL',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'halloween',
    occasionLabel: 'Halloween',
    dateDisplay: 'October 24, 2016',
    year: 2016,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.35,
    journalRefs: [127, 154],
    curatorialNote:
      'Stirring a bubbling cauldron over crackling firewood—combining October birthdays with Halloween rhyme.',
  },
  {
    id: 'lucky-leprechaun-st-paddys',
    file: 'IMG_6218.JPEG',
    title: 'Lucky Leprechaun in a Pot of Gold',
    caption: "ME'S A LUCKY LEPRECHAUN MINE IN TIME FOR ST. PADDY'S",
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'st-patricks',
    occasionLabel: 'St. Patrick’s Day',
    dateDisplay: 'March 4, 2016',
    year: 2016,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 0.99, height: 0.916 },
    deglare: 0.35,
    journalRefs: [127, 154],
    curatorialNote:
      'Tossing gold coins skyward beside a shamrock on the Frigidaire freezer door.',
  },
  {
    id: 'welcome-to-madison-joy',
    file: 'IMG_5981.JPG',
    title: 'Welcome to Madison, Joy',
    caption: 'WELCOME TO MADISON JOY AND HAPPY BIRTHDAY',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'December 5, 2015',
    year: 2015,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.35,
    journalRefs: [127, 154, 233],
    curatorialNote:
      'An architectural chalk rendering of the Wisconsin State Capitol dome and musical notes welcoming Tracy’s mother Joy to Madison for her birthday.',
  },
  {
    id: 'happy-80th-birthday-joy',
    file: 'IMG_2288.JPG',
    title: 'Happy 80th Birthday Joy',
    caption: '80 · HAPPY 80th BIRTHDAY JOY',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'December 3, 2012',
    year: 2012,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 0.975, height: 0.912 },
    deglare: 0.5,
    journalRefs: [127, 233],
    curatorialNote:
      'A grinning frosted cake with rainbow candles hoisting an “80” placard for Tracy’s mother Joy.',
  },
  {
    id: 'we-want-luke-bucky',
    file: 'IMG_2287.JPG',
    title: 'We Want Luke! — Bucky Badger',
    caption: 'WE WANT LUKE · WE WANT LUKE! · WE WANT LUKE!',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door — Colored Chalk on Matte Black Paint',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'January 31, 2012',
    year: 2012,
    featured: true,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.52,
    journalRefs: [9, 63, 127],
    curatorialNote:
      'A fierce Bucky Badger in his cardinal-and-white Wisconsin sweater recruiting grandson Luke to Madison!',
  },
  {
    id: 'top-of-the-moonin',
    file: 'IMG_2284.JPG',
    title: 'Top of the Moonin’ to Ya!',
    caption: "TOP OF THE MOONIN' TO YA!",
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'st-patricks',
    occasionLabel: 'St. Patrick’s Day',
    dateDisplay: 'March 12, 2012',
    year: 2012,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 0.995, height: 0.915 },
    deglare: 0.55,
    journalRefs: [127, 154],
    curatorialNote:
      'Irreverent Dzia humor at its finest: a leprechaun dropping his green trousers in shamrock boxers to moon visitors entering the garage.',
  },
  {
    id: 'hey-valentine-frog-prince',
    file: 'IMG_1346_Original.JPG',
    title: 'Frog Prince Valentine',
    caption: 'HEY VALENTINE — “ _ _ _ _ ” ME AND I’LL CHANGE INTO A PRINCE!',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Frigidaire Emblem Visible)',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'February 2013',
    year: 2013,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.4,
    journalRefs: [127, 154, 157],
    curatorialNote:
      'A crowned green frog flanked by pink chalk hearts with a four-letter fill-in-the-blank prompt.',
  },
  {
    id: 'screw-the-bird-pig-out',
    file: 'IMG_0136.JPEG',
    title: 'Screw the Bird, Let’s Pig Out',
    caption: "SCREW THE BIRD · LET'S PIG OUT",
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Archival Print Rectified from Album)',
    occasion: 'thanksgiving',
    occasionLabel: 'Thanksgiving',
    dateDisplay: 'c. November 2013',
    year: 2013,
    featured: true,
    crop: { left: 0.044, top: 0.273, width: 0.896, height: 0.404 },
    deglare: 0.35,
    journalRefs: [127, 154],
    curatorialNote:
      'Charlie Brown and Chef Snoopy serving a roast pig on a platter across the Frigidaire door—cropped cleanly from Tracy’s physical photo album.',
  },
  {
    id: 'gina-lets-have-a-blast',
    file: 'IMG_0142.JPEG',
    title: 'Gina, Let’s Have a Blast — “Kaboom”',
    caption: 'GINA LET’S HAVE A BLAST “KABOOM”',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Archival Print Rectified from Album)',
    occasion: 'patriotic',
    occasionLabel: 'Patriotic, Golf & Wit',
    dateDisplay: 'c. July 2013',
    year: 2013,
    featured: false,
    crop: { left: 0.022, top: 0.094, width: 0.856, height: 0.738 },
    deglare: 0.35,
    journalRefs: [9, 63, 127],
    curatorialNote:
      'A dancing lit firecracker tipping an Uncle Sam top hat to granddaughter Gina on the Frigidaire freezer door.',
  },
  {
    id: 'ginas-2013-career-rhyme',
    file: 'IMG_0144.JPEG',
    title: 'Gina’s 2013 — Oh Good Grief!',
    caption: "GINA'S 2013 · TEACHER TAILOR SOLDIER OR SAILOR? RESEACHER WRITER CLERK OR THIEF? DOCTOR LAWYER? OH GOOD GRIEF!",
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Archival Print Rectified from Album)',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: '2013',
    year: 2013,
    featured: true,
    crop: { left: 0.045, top: 0.132, width: 0.85, height: 0.722 },
    deglare: 0.35,
    journalRefs: [9, 63, 127],
    curatorialNote:
      'Playfully teasing granddaughter Gina surrounded by floating chalk question marks as she pondered her career path in 2013.',
  },
  {
    id: 'stuffing-goes-where-turkey',
    file: 'IMG_0143.JPEG',
    title: 'What? The Stuffing Goes Where?',
    caption: 'WHAT? THE STUFFING GOES WHERE?',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Archival Print Rectified from Album)',
    occasion: 'thanksgiving',
    occasionLabel: 'Thanksgiving',
    dateDisplay: 'c. November 2012',
    year: 2012,
    featured: false,
    crop: { left: 0.052, top: 0.082, width: 0.854, height: 0.748 },
    deglare: 0.5,
    journalRefs: [127, 154],
    curatorialNote:
      'Wide-eyed, sweating Thanksgiving turkey learning the culinary facts of life on the garage freezer door.',
  },
  {
    id: 'hoppy-easter-bunny-shorts',
    file: 'IMG_0141.JPEG',
    title: 'Hoppy Easter in Patterned Boardshorts',
    caption: 'HOPPY EASTER',
    medium: 'freezer-door',
    mediumLabel: 'Garage Freezer Door (Archival Print Rectified from Album)',
    occasion: 'easter',
    occasionLabel: 'Easter & Spring',
    dateDisplay: 'c. April 2013',
    year: 2013,
    featured: false,
    crop: { left: 0.125, top: 0.088, width: 0.788, height: 0.87 },
    deglare: 0.35,
    journalRefs: [127, 154],
    curatorialNote:
      'Arms-crossed Easter bunny standing in lush green chalk grass wearing Easter-egg-patterned shorts.',
  },
  // --- PORCELAIN MINI-EASEL PLATTER SERIES (2008–2013) ---
  {
    id: 'happy-dads-day-swimmer',
    file: 'IMG_0129.JPEG',
    title: 'Happy Dad’s Day! (Origin Story)',
    caption: "HAPPY DAD'S DAY!",
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Dry-Erase / Ceramic Marker',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'c. June 2011',
    year: 2011,
    featured: true,
    crop: { left: 0.008, top: 0.01, width: 0.942, height: 0.968 },
    deglare: 0.0,
    journalRefs: [10, 127],
    curatorialNote:
      'Unmistakably Bob—remember, he majored in Biology at Le Moyne and briefly attended medical school before the Air Force, making this smiling Father’s Day swimmer doubly fitting!',
  },
  {
    id: 'robert-gina-mad-city',
    file: 'IMG_0130.JPEG',
    title: 'Robert & Gina — “Mad” City Welcomes U',
    caption: 'ROBERT · “MAD” CITY WELCOMES U · GINA',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'c. 2011',
    year: 2011,
    featured: true,
    crop: { left: 0.008, top: 0.162, width: 0.984, height: 0.66 },
    deglare: 0.0,
    journalRefs: [9, 63, 73],
    curatorialNote:
      'Before moving onto the giant garage freezer door, Bob welcomed grandchildren Robert and Gina to Madison with fireworks and the Capitol dome on his tabletop porcelain platter.',
  },
  {
    id: 'madison-or-megabust-dave',
    file: 'IMG_0134.JPEG',
    title: 'Madison or Megabust — Welcome Dave',
    caption: 'MADISON OR MEGABUST · WELCOME DAVE',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'c. 2011',
    year: 2011,
    featured: false,
    crop: { left: 0.015, top: 0.072, width: 0.975, height: 0.812 },
    deglare: 0.0,
    journalRefs: [12, 127],
    curatorialNote:
      'Welcoming his younger brother David arriving in Madison aboard an orange bus.',
  },
  {
    id: 'tracy-key-to-my-heart',
    file: 'IMG_1349_Original.JPG',
    title: 'Tracy — Key to My Heart',
    caption: 'TRACY — KEY TO MY [HEART]',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'February 2013',
    year: 2013,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.0,
    journalRefs: [9, 157, 231],
    curatorialNote:
      'An antique key unlocking a crimson heart against a warm tangerine wash for Tracy.',
  },
  {
    id: 'snowman-golf-just-cant-wait',
    file: 'IMG_0138.JPEG',
    title: 'Just Can’t Wait (Winter Golfer Snowman)',
    caption: "JUST CAN'T WAIT",
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'patriotic',
    occasionLabel: 'Patriotic, Golf & Wit',
    dateDisplay: 'c. Winter 2012',
    year: 2012,
    featured: false,
    crop: { left: 0.018, top: 0.082, width: 0.964, height: 0.895 },
    deglare: 0.0,
    journalRefs: [12, 98, 121],
    curatorialNote:
      'Even in deep Wisconsin winter, Bob’s snowman is practicing his iron swing while dreaming of spring tee times.',
  },
  {
    id: 'bah-humbug-snowed-golf-green',
    file: 'picasabackground_Original.JPG',
    title: 'Bah Humbug — Snowed-Out Putting Green',
    caption: 'BAH HUMBUG',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'c. December 2009',
    year: 2009,
    featured: false,
    crop: { left: 0.0, top: 0.0, width: 1.0, height: 1.0 },
    deglare: 0.0,
    journalRefs: [12, 98, 127],
    curatorialNote:
      'A decorated Christmas tree beside a snow-buried putting green and red pin flag—Bob’s perennial December lament when golf season ended.',
  },
  {
    id: 'baby-new-year-2012',
    file: 'IMG_0139.JPEG',
    title: 'Baby New Year “2012”',
    caption: '“2012”',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'January 2012',
    year: 2012,
    featured: false,
    crop: { left: 0.072, top: 0.012, width: 0.86, height: 0.955 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Baby New Year leaping joyfully in a green sash with cane, top hat, and red fireworks.',
  },
  {
    id: 'appy-nu-yr-champagne',
    file: 'P1020418_Original.JPG',
    title: '’Appy Nu Yr Champagne Toast',
    caption: "'APPY NU YR",
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'January 2010',
    year: 2010,
    featured: false,
    crop: { left: 0.08, top: 0.04, width: 0.84, height: 0.92 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Bubbly pouring into a ribboned champagne flute surrounded by confetti and streamers.',
  },
  {
    id: 'santa-ho-ho-ho-platter',
    file: 'IMG_6106.JPEG',
    title: 'Ho Ho Ho — Spectacled Santa',
    caption: 'HO HO HO',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter (Rectified from Photo Album)',
    occasion: 'christmas',
    occasionLabel: 'Christmas & New Year',
    dateDisplay: 'c. December 2011',
    year: 2011,
    featured: false,
    crop: { left: 0.006, top: 0.294, width: 0.984, height: 0.548 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Minimalist portrait of Santa peering over wire-rimmed spectacles.',
  },
  {
    id: 'boo-two-vampires',
    file: '001_Original.JPG',
    title: 'BOO — Twin Halloween Vampires',
    caption: 'BOO',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'halloween',
    occasionLabel: 'Halloween',
    dateDisplay: 'October 2009',
    year: 2009,
    featured: false,
    crop: { left: 0.06, top: 0.0, width: 0.89, height: 0.96 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Two fanged Halloween ghouls with flame-tipped hair on the miniature porcelain platter.',
  },
  {
    id: 'gobble-me-turkey',
    file: 'P1010564_Original.JPG',
    title: 'Gobble Me',
    caption: 'GOBBLE ME',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'thanksgiving',
    occasionLabel: 'Thanksgiving',
    dateDisplay: 'November 2008',
    year: 2008,
    featured: false,
    crop: { left: 0.05, top: 0.24, width: 0.78, height: 0.62 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'One of the earliest dated works in the collection (November 2008): fine multicolored feather strokes on porcelain.',
  },
  {
    id: 'go-stuff-yourself-turkey',
    file: 'P1020307_Original.JPG',
    title: 'Go Stuff Yourself',
    caption: 'GO STUFF YOUR-SELF',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'thanksgiving',
    occasionLabel: 'Thanksgiving',
    dateDisplay: 'November 2009',
    year: 2009,
    featured: false,
    crop: { left: 0.16, top: 0.0, width: 0.62, height: 0.94 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'A dapper turkey in a blue Pilgrim top hat delivering a classic Thanksgiving retort.',
  },
  {
    id: 'irish-i-were-drunk',
    file: 'IMG_0140.JPEG',
    title: 'Irish I Were Drunk',
    caption: 'irish i were drunk',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker',
    occasion: 'st-patricks',
    occasionLabel: 'St. Patrick’s Day',
    dateDisplay: 'c. March 2011',
    year: 2011,
    featured: false,
    crop: { left: 0.02, top: 0.084, width: 0.915, height: 0.822 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'A frothy mug of green St. Patrick’s Day beer.',
  },
  {
    id: 'full-of-blarney',
    file: 'P1010702_Original.JPG',
    title: 'U’R Full of Blarney',
    caption: "U'R Full [mug] of BLARNEY",
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'st-patricks',
    occasionLabel: 'St. Patrick’s Day',
    dateDisplay: 'March 2009',
    year: 2009,
    featured: false,
    crop: { left: 0.21, top: 0.02, width: 0.57, height: 0.95 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Monochromatic emerald marker study for St. Patrick’s Day 2009.',
  },
  {
    id: 'may-irish-luck-be-yours',
    file: 'IMG_0131.JPEG',
    title: 'May Irish Luck Be Your’s',
    caption: "MAY IRISH LUCK BE YOUR'S",
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'st-patricks',
    occasionLabel: 'St. Patrick’s Day',
    dateDisplay: 'c. March 2011',
    year: 2011,
    featured: false,
    crop: { left: 0.005, top: 0.005, width: 0.988, height: 0.91 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Rainbow arcing into an overflowing black cauldron of gold under a bright yellow sun.',
  },
  {
    id: 'happeep-eggster-vignette',
    file: 'IMG_0132.JPEG',
    title: 'Happeep Eggster Tabletop Vignette',
    caption: 'HAPPEEP EGGSTER',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter Staged with Ceramic Easter Chick',
    occasion: 'easter',
    occasionLabel: 'Easter & Spring',
    dateDisplay: 'c. April 2011',
    year: 2011,
    featured: false,
    crop: { left: 0.052, top: 0.102, width: 0.905, height: 0.735 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Displayed on the sideboard tethered by a white ribbon to a vintage yellow Easter chick figurine.',
  },
  {
    id: 'yea-spring-bunny',
    file: 'IMG_0128.JPEG',
    title: 'Yea Spring!',
    caption: 'YEA SPRING',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter (Rectified from Photo Album)',
    occasion: 'easter',
    occasionLabel: 'Easter & Spring',
    dateDisplay: 'c. Spring 2011',
    year: 2011,
    featured: false,
    crop: { left: 0.01, top: 0.228, width: 0.936, height: 0.556 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'A bounding hare leaping over spring blossoms into warm sunshine.',
  },
  {
    id: 'ka-boom-4th-vignette',
    file: 'IMG_0133.JPEG',
    title: 'Ka Boom! — Independence Day Centerpiece',
    caption: 'KA BOOM!',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter with American Flags',
    occasion: 'patriotic',
    occasionLabel: 'Patriotic, Golf & Wit',
    dateDisplay: 'c. July 4, 2011',
    year: 2011,
    featured: false,
    crop: { left: 0.092, top: 0.042, width: 0.825, height: 0.86 },
    deglare: 0.0,
    journalRefs: [82, 126, 179],
    curatorialNote:
      'Staged in front of a crimson vase holding twin American flags—fitting for the Colonel who loved July 4th fireworks (see Journal pp. 179 & 183).',
  },
  {
    id: 'happy-4th-shooting-star',
    file: 'P1010864_Original.JPG',
    title: 'Happy 4th Shooting Star',
    caption: 'HAPPY 4th',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'patriotic',
    occasionLabel: 'Patriotic, Golf & Wit',
    dateDisplay: 'July 2009',
    year: 2009,
    featured: false,
    crop: { left: 0.02, top: 0.0, width: 0.9, height: 0.98 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Red, white, and blue shooting star bursting across the miniature platter.',
  },
  {
    id: 'layers-of-love-cake',
    file: 'IMG_0135.JPEG',
    title: 'Layers of Love — Happy Bday',
    caption: 'LAYERS OF LOVE · HAPPY BDAY',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'c. 2011',
    year: 2011,
    featured: false,
    crop: { left: 0.025, top: 0.046, width: 0.95, height: 0.924 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Three-tiered red-and-cream birthday cake with a single glowing candle on an emerald cake stand.',
  },
  {
    id: 'be-mine-valentine-monster',
    file: 'P1020428_Original.JPG',
    title: 'Be Mine — Sweet Valentine Monster',
    caption: 'BE MINE',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'family',
    occasionLabel: 'Birthdays, Family & Love',
    dateDisplay: 'February 2010',
    year: 2010,
    featured: false,
    crop: { left: 0.28, top: 0.02, width: 0.46, height: 0.88 },
    deglare: 0.0,
    journalRefs: [127, 157],
    curatorialNote:
      'A grinning emerald creature offering a daisy surrounded by floating hearts.',
  },
  {
    id: 'summer-sunflower-2008',
    file: 'P1010212_Original.JPG',
    title: 'Summer :) Sunflower (Earliest Dated Platter)',
    caption: 'SUMMER :)',
    medium: 'porcelain-platter',
    mediumLabel: 'Porcelain Mini-Easel Platter — Ceramic Marker on Tabletop Easel',
    occasion: 'patriotic',
    occasionLabel: 'Patriotic, Golf & Wit',
    dateDisplay: 'July 29, 2008',
    year: 2008,
    featured: false,
    crop: { left: 0.17, top: 0.06, width: 0.63, height: 0.88 },
    deglare: 0.0,
    journalRefs: [127],
    curatorialNote:
      'Dated July 29, 2008—the earliest surviving photograph of Bob’s seasonal household illustrations.',
  },
];

async function processPiece(item, index) {
  let inputBuffer;
  const rawPath = path.join(RAW_DIR, item.file);

  if (item.isVideoKeyframe) {
    const tmpFrame = path.join(SCRATCH_DIR, `keyframe_${item.id}.png`);
    execFileSync(ffmpegPath, ['-y', '-ss', '0.8', '-i', rawPath, '-frames:v', '1', '-update', '1', tmpFrame], {
      stdio: 'ignore',
    });
    inputBuffer = await fs.readFile(tmpFrame);
  } else {
    inputBuffer = await fs.readFile(rawPath);
  }

  const base = sharp(inputBuffer).rotate();
  const meta = await base.metadata();
  const ow = meta.width;
  const oh = meta.height;

  const left = Math.max(0, Math.round(ow * item.crop.left));
  const top = Math.max(0, Math.round(oh * item.crop.top));
  const width = Math.min(ow - left, Math.round(ow * item.crop.width));
  const height = Math.min(oh - top, Math.round(oh * item.crop.height));

  // Upscale cleanly so even 2008-era camera shots and MOV keyframes look crisp on 2x displays
  const maxDim = 1800;
  const scale = maxDim / Math.max(width, height);
  const outW = Math.round(width * Math.min(1.6, Math.max(0.85, scale)));
  const outH = Math.round(height * Math.min(1.6, Math.max(0.85, scale)));

  let { data, info } = await sharp(inputBuffer)
    .rotate()
    .extract({ left, top, width, height })
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Deterministic dark-slate de-glare & black-point restoration for chalkboard works:
  // Estimates smooth low-frequency ambient light haze (e.g. garage window blue glare)
  // and gently deepens only low-saturation dark slate background pixels without altering chalk strokes!
  if (item.deglare > 0) {
    const bgHaze = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .blur(46)
      .raw()
      .toBuffer();

    const out = Buffer.alloc(data.length);
    const strength = item.deglare;

    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const br = bgHaze[i];
      const bg = bgHaze[i + 1];
      const bb = bgHaze[i + 2];

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const bgLum = 0.299 * br + 0.587 * bg + 0.114 * bb;

      // Detect whether pixel belongs to chalk/badge (brighter than local slate OR colorful)
      const localContrast = Math.max(0, lum - bgLum);
      const chroma = maxC - minC;
      const isSlate = Math.max(0, 1 - localContrast / 26) * Math.max(0, 1 - chroma / 68);

      // Subtract ambient window haze mostly from slate, gently lifting chalk contrast
      const subR = Math.max(0, br - 14) * strength * (0.35 + 0.65 * isSlate);
      const subG = Math.max(0, bg - 15) * strength * (0.35 + 0.65 * isSlate);
      const subB = Math.max(0, bb - 17) * strength * (0.42 + 0.58 * isSlate);

      // Slight vibrancy & crispness boost on chalk pigment
      const gain = 1 + 0.09 * strength;
      out[i] = clampByte((r - subR) * gain);
      out[i + 1] = clampByte((g - subG) * gain);
      out[i + 2] = clampByte((b - subB) * gain);
      if (info.channels === 4) out[i + 3] = data[i + 3];
    }
    data = out;
  }

  const processed = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).sharpen({
    sigma: 0.7,
    m1: 0.5,
    m2: 1.5,
  });

  const thumbW = 680;
  const thumbH = Math.round((info.height / info.width) * thumbW);

  const fullFile = `${item.id}-full.webp`;
  const thumbWebp = `${item.id}-thumb.webp`;
  const thumbAvif = `${item.id}-thumb.avif`;

  await Promise.all([
    processed.clone().webp({ quality: 86 }).toFile(path.join(OUT_DIR, fullFile)),
    processed.clone().resize(thumbW, thumbH).webp({ quality: 81 }).toFile(path.join(OUT_DIR, thumbWebp)),
    processed.clone().resize(thumbW, thumbH).avif({ quality: 66 }).toFile(path.join(OUT_DIR, thumbAvif)),
  ]);

  return {
    order: index + 1,
    id: item.id,
    title: item.title,
    caption: item.caption,
    medium: item.medium,
    mediumLabel: item.mediumLabel,
    occasion: item.occasion,
    occasionLabel: item.occasionLabel,
    dateDisplay: item.dateDisplay,
    year: item.year,
    featured: item.featured,
    journalRefs: item.journalRefs,
    curatorialNote: item.curatorialNote,
    width: info.width,
    height: info.height,
    thumbWidth: thumbW,
    thumbHeight: thumbH,
    fullSrc: `/images/chalk/${fullFile}`,
    thumbWebp: `/images/chalk/${thumbWebp}`,
    thumbAvif: `/images/chalk/${thumbAvif}`,
  };
}

async function buildContactSheets(records) {
  // Build 2 contact sheets (25 + 24 thumbnails) in scratch/ so we can visually verify all 49 crops!
  const cols = 5;
  const cellW = 320;
  const cellH = 260;

  for (let sheet = 0; sheet < 2; sheet++) {
    const slice = records.slice(sheet * 25, (sheet + 1) * 25);
    const rows = Math.ceil(slice.length / cols);
    const composites = [];

    for (let i = 0; i < slice.length; i++) {
      const rec = slice[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const buf = await sharp(path.join(ROOT, 'public', rec.thumbWebp))
        .resize(cellW - 16, cellH - 16, { fit: 'contain', background: { r: 24, g: 26, b: 32 } })
        .png()
        .toBuffer();
      composites.push({
        input: buf,
        left: col * cellW + 8,
        top: row * cellH + 8,
      });
    }

    await sharp({
      create: {
        width: cols * cellW,
        height: rows * cellH,
        channels: 3,
        background: { r: 12, g: 14, b: 18 },
      },
    })
      .composite(composites)
      .jpeg({ quality: 86 })
      .toFile(path.join(SCRATCH_DIR, `chalk_contact_sheet_${sheet + 1}.jpg`));
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DATA_OUT), { recursive: true });

  const results = [];
  // Process in batches of 6 for speed
  for (let i = 0; i < ARTWORKS.length; i += 6) {
    const batch = ARTWORKS.slice(i, i + 6);
    const done = await Promise.all(batch.map((item, idx) => processPiece(item, i + idx)));
    results.push(...done);
  }

  await fs.writeFile(DATA_OUT, JSON.stringify(results, null, 2), 'utf8');
  await buildContactSheets(results);
  console.log(`Processed all ${results.length} chalk & ceramic artworks -> public/images/chalk/ & src/data/chalk-art.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
