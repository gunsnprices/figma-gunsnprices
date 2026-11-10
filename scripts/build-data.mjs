// Builds src/data/catalog.json, the offline data the plugin ships with.
//
//   node scripts/build-data.mjs [--datasets DIR] [--sample DIR]
//
// --datasets  a checkout of github.com/gunsnprices/firearm-datasets (models/models.csv, calibers/calibers.csv)
// --sample    a GunsNPrices catalog sample with store titles (lib_guns.tsv, lib_ammo.tsv), same snapshot day
//
// Firearm rows: every model in models.csv that is a handgun, rifle or shotgun, was in stock and has a price.
// Its typical magazine capacity and barrel length are the most common values read (by the gunsnprices parser)
// from the store titles of that model in the catalog sample. The product title is built from those parts and
// kept only if the parser reads every part back from it.
// Ammo rows: real store titles from the catalog sample (SKU tails removed), in stock, with a box price, where the
// parser and the store agree on the round count. All-caps titles, components and accessories are left out.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findCalibers,
  identifyModel,
  magazineCapacity,
  barrelLength,
  roundsPerBox,
  looksLikeAmmo,
  parseTitle,
  listCalibers,
} from 'gunsnprices';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? path.resolve(process.argv[i + 1]) : dflt;
};
const DATASETS = arg('--datasets', path.resolve(root, '../repos/firearm-datasets'));
const SAMPLE = arg('--sample', path.resolve(root, '../library/testdata'));
const OUT = path.join(root, 'src/data/catalog.json');
const SNAPSHOT = '2026-10-12';

// ---------- helpers ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [hdr, ...body] = rows;
  return body.filter((r) => r.length === hdr.length).map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i]])));
}
function readTsv(file) {
  const [hdr, ...lines] = fs.readFileSync(file, 'utf8').split('\n');
  const cols = hdr.split('\t');
  return lines.filter(Boolean).map((l) => {
    const c = l.split('\t');
    return Object.fromEntries(cols.map((h, i) => [h, c[i] ?? '']));
  });
}
const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function mode(counts, ok = () => true) {
  let best = null, bestN = 0;
  for (const [k, n] of Object.entries(counts)) {
    const v = Number(k);
    if (ok(v) && (n > bestN || (n === bestN && v > best))) { best = v; bestN = n; }
  }
  return best;
}
const money = (s) => (s === '' || s == null ? null : Math.round(Number(s) * 100) / 100);

// Calibers as stores usually write them in a title, when the standard name is long.
const TITLE_CALIBER = {
  '9×19mm Parabellum': '9mm',
  '5.56×45mm NATO': '5.56 NATO',
  '.38 S&W Special': '.38 Special',
  '.300 AAC Blackout': '.300 Blackout',
  '7mm Remington Magnum': '7mm Rem Mag',
};
const NOUN = { handgun: 'Pistol', rifle: 'Rifle', shotgun: 'Shotgun' };
const BARREL_RANGE = { handgun: [1.5, 12], rifle: [10, 34], shotgun: [12, 34] };

// ---------- firearms ----------
const perModel = new Map();
const perFamily = new Map(); // revolver or pistol is decided for the whole family: sub-models have few titles
for (const r of readTsv(path.join(SAMPLE, 'lib_guns.tsv'))) {
  const title = decode(r.name);
  const m = identifyModel(title, { brand: r.manufacturer, mpn: r.mpn, sku: r.sku });
  if (!m) continue;
  let p = perModel.get(m.model);
  if (!p) perModel.set(m.model, (p = { cap: {}, bar: {} }));
  const cap = magazineCapacity(title);
  const bar = barrelLength(title);
  if (cap) p.cap[cap] = (p.cap[cap] || 0) + 1;
  if (bar) p.bar[bar] = (p.bar[bar] || 0) + 1;
  let f = perFamily.get(m.family);
  if (!f) perFamily.set(m.family, (f = { revolver: 0, n: 0 }));
  f.n++;
  if (/\brevolvers?\b|\bcylinder\b|\bSAA\b|\bwheel ?gun\b/i.test(title)) f.revolver++;
}
// "Revolver" when a quarter of the family's titles say so, "Pistol" when (almost) none of 5+ do, else no noun.
function handgunNoun(family) {
  const f = perFamily.get(family);
  if (!f) return '';
  if (f.revolver >= 2 && f.revolver * 4 >= f.n) return 'Revolver';
  if (f.n >= 5 && f.revolver * 20 <= f.n) return 'Pistol';
  return '';
}

const guns = [];
const gunStats = { candidates: 0, noSpecs: 0, noRoundTrip: 0 };
for (const r of parseCsv(fs.readFileSync(path.join(DATASETS, 'models/models.csv'), 'utf8'))) {
  if (!NOUN[r.type] || !r.price_median_usd || Number(r.in_stock) < 1) continue;
  gunStats.candidates++;
  const caliber = findCalibers(r.calibers)[0];
  const p = perModel.get(r.model);
  const [lo, hi] = BARREL_RANGE[r.type];
  const capacity = p && mode(p.cap, (v) => v >= 1 && v <= 100);
  const barrel = p && mode(p.bar, (v) => v >= lo && v <= hi);
  if (!caliber || !capacity || !barrel) { gunStats.noSpecs++; continue; }
  // the dataset's family names can differ from the parser's, so ask the parser for the family of this model
  const noun = r.type === 'handgun' ? handgunNoun(identifyModel(r.model, { brand: r.brand })?.family ?? r.family) : NOUN[r.type];
  const calText = TITLE_CALIBER[caliber.name] || caliber.name;
  const endsWithNoun = noun !== '' && new RegExp(`\\b${noun}$`, 'i').test(r.model);
  // the way stores write it: 15rd pistol, 6-Shot revolver, 4+1 rifle or shotgun
  const capText =
    noun === 'Revolver' || (r.type === 'handgun' && capacity < 4) ? `${capacity}-Shot`
    : r.type === 'handgun' ? `${capacity}rd`
    : capacity === 1 ? 'Single Shot'
    : `${capacity}+1`;
  const title = `${r.model} ${calText} ${barrel}" ${capText}${noun && !endsWithNoun ? ' ' + noun : ''}`;
  const back = parseTitle(title, { kind: 'firearm' });
  if (back.model?.model !== r.model || back.caliber?.id !== caliber.id || back.capacity !== capacity || back.barrelLength !== barrel) {
    gunStats.noRoundTrip++;
    continue;
  }
  // A lowest price under half the median is usually a part or an accessory matched to the model: dropped.
  const median = money(r.price_median_usd);
  const min = money(r.price_min_usd);
  guns.push([
    r.brand, r.family, r.model, r.type, caliber.name, title, capacity, barrel,
    min !== null && min >= median / 2 ? min : null, median, Number(r.listings),
  ]);
}
guns.sort((a, b) => b[10] - a[10] || a[2].localeCompare(b[2]));

// ---------- ammo ----------
// caliber popularity: gun and ammo listings on GunsNPrices (calibers.csv)
const counts = new Map(
  parseCsv(fs.readFileSync(path.join(DATASETS, 'calibers/calibers.csv'), 'utf8')).map((r) => [
    r.id,
    Number(r.products_guns || 0) + Number(r.products_ammo || 0),
  ]),
);
const popularity = new Map(listCalibers().map((c) => [c.name, counts.get(c.id) || 0]));
const AMMO_BRANDS = [
  ['Federal Premium', 'Federal'], ['Federal', 'Federal'], ['American Eagle', 'Federal'],
  ['Winchester', 'Winchester'], ['Remington', 'Remington'], ['Hornady', 'Hornady'], ['CCI', 'CCI'],
  ['Blazer', 'CCI'], ['Speer', 'Speer'], ['PMC', 'PMC'], ['Fiocchi', 'Fiocchi'],
  ['Sellier & Bellot', 'Sellier & Bellot'], ['Magtech', 'Magtech'], ['Aguila', 'Aguila'], ['Sig Sauer', 'Sig Sauer'],
  ['Norma', 'Norma'], ['Nosler', 'Nosler'], ['Barnes', 'Barnes'], ['Prvi Partizan', 'Prvi Partizan'],
  ['PPU', 'Prvi Partizan'], ['Underwood', 'Underwood'], ['Buffalo Bore', 'Buffalo Bore'], ['HSM', 'HSM'],
  ['Black Hills', 'Black Hills'], ['Fort Scott', 'Fort Scott Munitions'], ['Weatherby', 'Weatherby'],
  ['Kent', 'Kent Cartridge'], ['Rio', 'Rio Ammunition'], ['Armscor', 'Armscor'], ['Browning', 'Browning'],
  ['Lapua', 'Lapua'], ['Wolf', 'Wolf'], ['Tula', 'Tula'], ['Liberty', 'Liberty Ammunition'],
  ['DoubleTap', 'DoubleTap'], ['Wilson Combat', 'Wilson Combat'], ['Grizzly', 'Grizzly Cartridge'],
  ['Ammo Inc', 'Ammo Inc'], ['Geco', 'Geco'], ['Swift', 'Swift'], ['Eley', 'Eley'], ['Scorpion', 'Scorpion'],
  ['Baschieri & Pellagri', 'Baschieri & Pellagri'], ['Nobelsport', 'Nobel Sport'], ['Estate', 'Estate'],
];
const NOT_LOADED_AMMO = /\b(bullets?|brass only|primers?|snap ?caps?|dummy|dummies|blanks?|holds|reloading|stripper|clips?|magazines?|can|crate|empty|shell holder|tracer|incendiary|less lethal|rubber)\b/i;
const ROUNDS_END = /(\b\d[\d,]*\s?(rounds?|rds?|rd|ct|count)\.?|\b\d[\d,]*\/(box|bx|pk|pack|ct)|box of \d+|\(\d+\/box\))$/i;
const CPR_RANGE = { handgun: [0.12, 4], rifle: [0.25, 12], rimfire: [0.03, 0.8], shotgun: [0.2, 8] };

function cleanAmmoTitle(raw) {
  let t = decode(raw).replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*\[[^\]]*\]$/, '');
  for (let i = 0; i < 3; i++) {
    const before = t;
    // " - 1C270BHGN1", ", 27613", " 30452", " 8605003800491" (SKU, UPC, part number tails)
    t = t.replace(/(\s+-\s+|,\s*|\s+)([A-Z0-9][A-Z0-9-]*\d[A-Z0-9/-]*)$/i, (m, sep, tok) => {
      if (/^\d[\d,]*\s?(rounds?|rds?|rd|ct)$/i.test(tok) || /^\d+\/(box|bx|pk|ct)$/i.test(tok)) return m;
      const sku = /[a-z]/i.test(tok) ? tok.length >= 4 && /\d/.test(tok) && !/^\d+(rd|rds|ct|gr|mm)$/i.test(tok) : tok.length >= 5;
      return sku && (sep.trim() !== '' || tok.length >= 5) ? '' : m;
    });
    t = t.replace(/[\s,-]+$/, '');
    if (t === before) break;
  }
  return t;
}
// A part number left inside the title: "Hornady 80873 Black ...", "Liberty La-cd-357sig-053 ...", "[MPN: 8053AG]".
const UNIT_TOKEN = /^[\d.,/-]+(gr|grain|grs|rd|rds|mm|ga|ct|lr|cal|oz|in|fps|wmr|hmr|sig|acp|win|rem|mag|nato|spl|x\d+|x\d+mm|sprg|blk|bmg|wby|wsm|wssm|prc)?\.?$/i;
function hasPartNumber(title) {
  if (/\bmpn\b|\bsku\b|\bupc\b/i.test(title)) return true;
  return title.split(/[\s,()]+/).some((tok) => {
    const digits = (tok.match(/\d/g) || []).length;
    if (digits < 3 || UNIT_TOKEN.test(tok)) return false;
    return /^\d{5,}$/.test(tok) || (/[a-z]/i.test(tok) && tok.length >= 6);
  });
}
function ammoBrand(title) {
  const low = title.toLowerCase();
  for (const [prefix, brand] of AMMO_BRANDS) if (low.startsWith(prefix.toLowerCase() + ' ')) return brand;
  return null;
}

const byCaliber = new Map();
const seen = new Set();
for (const r of readTsv(path.join(SAMPLE, 'lib_ammo.tsv'))) {
  const price = money(r.instock_min);
  if (!price || Number(r.instock_stores) < 1) continue;
  const title = cleanAmmoTitle(r.name);
  const letters = title.replace(/[^a-z]/gi, '');
  const lower = title.replace(/[^a-z]/g, '').length;
  if (title.length < 30 || title.length > 90 || lower / letters.length < 0.45) continue;
  if (/\d[A-Z][a-z]/.test(title)) continue; // "9Mm", "115Gr": a feed that capitalized every word
  if (NOT_LOADED_AMMO.test(title) || !looksLikeAmmo(title) || !ROUNDS_END.test(title) || hasPartNumber(title)) continue;
  const rounds = roundsPerBox(title);
  if (!rounds || String(rounds) !== r.rounds || rounds < 5 || rounds > 1000) continue;
  const cal = findCalibers(title);
  if (cal.length !== 1) continue;
  const brand = ammoBrand(title);
  if (!brand) continue;
  const [lo, hi] = CPR_RANGE[cal[0].type] || [0, 0];
  const cpr = price / rounds;
  if (cpr < lo || cpr > hi) continue;
  const key = title.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  if (!byCaliber.has(cal[0].name)) byCaliber.set(cal[0].name, []);
  byCaliber.get(cal[0].name).push([title, brand, cal[0].name, cal[0].type, rounds, price]);
}
// Up to 24 boxes for each of the 12 most listed calibers and 8 for the others (at least 3 needed),
// one brand at a time so that brands vary. Calibers in order of popularity.
const ammo = [];
const calOrder = [...byCaliber.entries()]
  .filter(([, v]) => v.length >= 3)
  .sort((a, b) => (popularity.get(b[0]) || 0) - (popularity.get(a[0]) || 0) || a[0].localeCompare(b[0]));
calOrder.forEach(([, list], rank) => {
  const limit = rank < 12 ? 24 : 8;
  const byBrand = new Map();
  for (const row of list.sort((a, b) => a[0].length - b[0].length)) {
    if (!byBrand.has(row[1])) byBrand.set(row[1], []);
    byBrand.get(row[1]).push(row);
  }
  const picked = [];
  while (picked.length < limit && [...byBrand.values()].some((v) => v.length)) {
    for (const v of byBrand.values()) if (v.length && picked.length < limit) picked.push(v.shift());
  }
  ammo.push(...picked);
});

// ---------- calibers ----------
const calibers = listCalibers()
  .filter((c) => ['handgun', 'rifle', 'rimfire', 'shotgun'].includes(c.type))
  .map((c) => [c.name, c.type, counts.get(c.id) || 0])
  .sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));

// Every word used in a caliber name or a store spelling of one ("9mm", "luger", "+p", "nato" ...). "Normalize caliber
// text" only rewrites text made of these words, so that a product title is never replaced by a caliber name.
const caliberRows = parseCsv(fs.readFileSync(path.join(DATASETS, 'calibers/calibers.csv'), 'utf8'));
const words = new Set();
const normWord = (w) => w.toLowerCase().replace(/^[^a-z0-9+]+|[^a-z0-9+]+$/g, '');
for (const r of caliberRows) {
  for (const spelling of [r.name, r.site_name, ...r.aliases.split(' | ')]) {
    for (const w of spelling.split(/[\s,;|()]+/)) if (normWord(w)) words.add(normWord(w));
  }
}
for (const c of listCalibers()) for (const w of c.name.split(/[\s,;|()]+/)) if (normWord(w)) words.add(normWord(w));

const out = {
  version: 1,
  snapshot: SNAPSHOT,
  attribution: 'Data: GunsNPrices (gunsnprices.com), CC BY 4.0',
  guns: {
    fields: ['brand', 'family', 'model', 'type', 'caliber', 'title', 'capacity', 'barrel', 'priceMin', 'priceMedian', 'listings'],
    rows: guns,
  },
  ammo: { fields: ['title', 'brand', 'caliber', 'caliberType', 'rounds', 'price'], rows: ammo },
  calibers: { fields: ['name', 'type', 'products'], rows: calibers },
  caliberWords: [...words].sort(),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
const byType = guns.reduce((a, g) => ((a[g[3]] = (a[g[3]] || 0) + 1), a), {});
console.log(`guns ${guns.length} ${JSON.stringify(byType)} (of ${gunStats.candidates}; no specs ${gunStats.noSpecs}, no round trip ${gunStats.noRoundTrip})`);
console.log(`ammo ${ammo.length} boxes in ${calOrder.length} calibers; calibers ${calibers.length}; caliber words ${words.size}`);
console.log(`${path.relative(root, OUT)} ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
