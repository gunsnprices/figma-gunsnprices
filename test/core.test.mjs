// Data selection, layer-name tags, values, card grouping and caliber text (out/core.mjs, built by `node build.mjs --core`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTitle, normalizeCaliber } from 'gunsnprices';
import {
  GUNS, AMMO, CALIBERS, SNAPSHOT, ATTRIBUTION,
  rowsOf, selectRows, brandsOf, calibersOf, shuffle,
  parseTag, fieldValue, money, costPerRoundCents, FIELDS,
  planFill, normalizeCaliberText,
} from '../out/core.mjs';

// ---------- data ----------

test('catalog: snapshot, attribution and sizes', () => {
  assert.equal(SNAPSHOT, '2026-10-12');
  assert.equal(ATTRIBUTION, 'Data: GunsNPrices (gunsnprices.com), CC BY 4.0');
  for (const type of ['handgun', 'rifle', 'shotgun']) assert.ok(GUNS.filter((g) => g.type === type).length > 250, type);
  assert.ok(AMMO.length > 500);
  assert.ok(CALIBERS.length > 250);
});

test('catalog: every firearm title reads back as its own model, caliber, capacity and barrel', () => {
  for (const g of GUNS) {
    const p = parseTitle(g.title, { kind: 'firearm' });
    assert.equal(p.model?.model, g.model, g.title);
    assert.equal(p.caliber?.name, g.caliber, g.title);
    assert.equal(p.capacity, g.capacity, g.title);
    assert.equal(p.barrelLength, g.barrel, g.title);
    assert.ok(g.priceMedian > 0 && (g.priceMin === null || g.priceMin <= g.priceMedian), g.title);
  }
});

test('catalog: every ammo box has a standard caliber, rounds in its title and a sane cost per round', () => {
  for (const a of AMMO) {
    assert.equal(normalizeCaliber(a.caliber)?.name, a.caliber, a.title);
    assert.equal(parseTitle(a.title).rounds, a.rounds, a.title);
    const cpr = a.price / a.rounds;
    assert.ok(cpr > 0.02 && cpr < 15, `${a.title}: ${cpr}`);
    assert.doesNotMatch(a.title, /&quot;|&amp;|\bMPN\b/, a.title);
  }
});

test('rowsOf: categories hold the right kind of rows; popular firearms come first', () => {
  assert.ok(rowsOf('handguns').every((r) => r.kind === 'gun' && r.type === 'handgun'));
  assert.ok(rowsOf('shotguns').every((r) => r.kind === 'gun' && r.type === 'shotgun'));
  assert.ok(rowsOf('ammo').every((r) => r.kind === 'ammo'));
  const h = rowsOf('handguns');
  for (let i = 1; i < h.length; i++) assert.ok(h[i - 1].listings >= h[i].listings);
});

test('rowsOf("ammo"): popular order alternates calibers', () => {
  const first = rowsOf('ammo').slice(0, 10).map((r) => r.caliber);
  assert.equal(new Set(first).size, 10);
  assert.equal(first[0], '9×19mm Parabellum');
});

test('selectRows: distinct rows while they last, then repeats', () => {
  const s = selectRows(6, { category: 'rifles' });
  assert.equal(s.rows.length, 6);
  assert.equal(new Set(s.rows.map((r) => r.model)).size, 6);
  assert.deepEqual(s.rows, rowsOf('rifles').slice(0, 6));

  const glock = selectRows(500, { category: 'handguns', brand: 'Glock', caliber: '10mm Auto' });
  assert.ok(glock.available > 0 && glock.available < 500);
  assert.ok(glock.rows.every((r) => r.brand === 'Glock' && r.caliber === '10mm Auto'));
  assert.equal(glock.rows[glock.available], glock.rows[0]);

  const none = selectRows(3, { category: 'ammo', brand: 'Glock' });
  assert.deepEqual(none, { rows: [], available: 0 });
});

test('selectRows: random order is reproducible with a seed and differs between seeds', () => {
  const a = selectRows(8, { category: 'handguns', order: 'random', seed: 42 });
  const b = selectRows(8, { category: 'handguns', order: 'random', seed: 42 });
  const c = selectRows(8, { category: 'handguns', order: 'random', seed: 43 });
  assert.deepEqual(a.rows, b.rows);
  assert.notDeepEqual(a.rows, c.rows);
  assert.equal(new Set(a.rows).size, 8);
  assert.deepEqual(shuffle([1, 2, 3, 4], 7).sort(), [1, 2, 3, 4]);
});

test('brandsOf / calibersOf: counts, most first, narrowed by the other filter', () => {
  const brands = brandsOf('handguns');
  assert.ok(brands.length > 20);
  for (let i = 1; i < brands.length; i++) assert.ok(brands[i - 1].count >= brands[i].count);
  assert.equal(brands.reduce((n, b) => n + b.count, 0), rowsOf('handguns').length);
  assert.ok(calibersOf('handguns', 'Glock').every((c) => rowsOf('handguns').some((r) => r.brand === 'Glock' && r.caliber === c.value)));
  assert.ok(brandsOf('ammo', '12 Gauge').length > 3);
});

// ---------- tags and values ----------

test('parseTag: #tags, aliases and hand-renamed layers', () => {
  assert.deepEqual(parseTag('#price'), { field: 'price' });
  assert.deepEqual(parseTag('Price #price copy 2'), { field: 'price' });
  assert.deepEqual(parseTag('#CPR'), { field: 'cpr' });
  assert.deepEqual(parseTag('#cost_per_round'), { field: 'cpr' });
  assert.deepEqual(parseTag('#calibre'), { field: 'caliber' });
  assert.deepEqual(parseTag('#name'), { field: 'title' });
  assert.deepEqual(parseTag('#bbl'), { field: 'barrel' });
  assert.deepEqual(parseTag('#foo'), { unknown: 'foo' });
  // a text layer that still has its automatic name (its own text) is not a tag
  assert.equal(parseTag('Price'), null);
  assert.deepEqual(parseTag('Price', true), { field: 'price' });
  assert.deepEqual(parseTag('Cost per round', true), { field: 'cpr' });
  assert.equal(parseTag('Add to cart', true), null);
  for (const f of FIELDS) assert.deepEqual(parseTag('#' + f.key), { field: f.key });
});

const glock = () => GUNS.find((g) => g.model === 'Glock 19 Gen 5');
const ammoBox = () => AMMO.find((a) => a.caliber === '9×19mm Parabellum' && a.rounds === 50);

test('fieldValue: firearm fields', () => {
  const g = glock();
  assert.equal(fieldValue('title', g), g.title);
  assert.match(g.title, /^Glock 19 Gen 5 9mm [\d.]+" \d+rd Pistol$/);
  assert.equal(fieldValue('brand', g), 'Glock');
  assert.equal(fieldValue('family', g), 'Glock 19');
  assert.equal(fieldValue('caliber', g), '9×19mm Parabellum');
  assert.equal(fieldValue('type', g), 'Handgun');
  assert.equal(fieldValue('price', g), money(g.priceMedian));
  assert.equal(fieldValue('from', g), 'From ' + money(g.priceMin));
  assert.equal(fieldValue('capacity', g), `${g.capacity} rounds`);
  assert.equal(fieldValue('barrel', g), `${g.barrel}"`);
  assert.equal(fieldValue('specs', g), `9×19mm Parabellum · ${g.barrel}" · ${g.capacity} rounds`);
  assert.equal(fieldValue('cpr', g), null);
  assert.equal(fieldValue('rounds', g), null);
});

test('fieldValue: ammo fields', () => {
  const a = ammoBox();
  assert.equal(fieldValue('title', a), a.title);
  assert.equal(fieldValue('caliber', a), '9×19mm Parabellum');
  assert.equal(fieldValue('type', a), 'Handgun ammo');
  assert.equal(fieldValue('rounds', a), '50 rounds');
  assert.equal(fieldValue('price', a), money(a.price));
  assert.equal(fieldValue('cpr', a), money(a.price / 50) + '/rd');
  assert.equal(fieldValue('model', a), null);
  assert.equal(fieldValue('capacity', a), null);
});

test('money and cost per round formatting', () => {
  assert.equal(money(1670.99), '$1,670.99');
  assert.equal(money(649), '$649.00');
  assert.equal(money(12199.99), '$12,199.99');
  assert.equal(money(0.3798), '$0.38');
  assert.equal(costPerRoundCents(18.99, 50), '38¢/rd');
  assert.equal(costPerRoundCents(3.89, 50), '7.8¢/rd');
  assert.equal(costPerRoundCents(63, 20), '$3.15/rd');
});

// ---------- grouping selected layers into cards ----------

// a tiny tree: { name, kids } is a frame, a string is a text layer named by the string
let ids = 0;
function tree(spec, parent = null, x = 0, y = 0) {
  if (typeof spec === 'string') return { id: ++ids, text: true, name: spec, parent, x, y };
  const n = { id: ++ids, text: false, name: spec.name ?? 'Frame', parent, x: spec.x ?? x, y: spec.y ?? y };
  n.kids = (spec.kids ?? []).map((k, i) => tree(k, n, i * 10, 0));
  return n;
}
const adapter = {
  isText: (n) => n.text,
  children: (n) => n.kids ?? null,
  tag: (n) => parseTag(n.name),
  parentKey: (n) => String(n.parent?.id ?? ''),
  position: (n) => ({ x: n.x, y: n.y }),
};
const card = (extra = {}) => ({ name: 'Card', kids: ['#title', '#caliber', 'Add to cart', '#price'], ...extra });
const fieldsOf = (plan) => plan.cards.map((c) => c.targets.map((t) => t.field).join(','));

test('plan: one selected card; untagged text inside it is left alone', () => {
  const plan = planFill([tree(card())], adapter, 'title');
  assert.deepEqual(fieldsOf(plan), ['title,caliber,price']);
});

test('plan: several selected cards, in reading order', () => {
  const a = tree(card({ x: 300, y: 0 })), b = tree(card({ x: 0, y: 0 })), c = tree(card({ x: 0, y: 400 }));
  const plan = planFill([a, b, c], adapter, null);
  assert.equal(plan.cards.length, 3);
  assert.deepEqual(plan.cards.map((k) => k.targets[0].node.parent), [b, a, c]);
});

test('plan: a frame of repeated cards, and a grid of rows of cards', () => {
  assert.equal(planFill([tree({ name: 'List', kids: [card(), card(), card(), card()] })], adapter, null).cards.length, 4);
  const grid = tree({ name: 'Grid', kids: [{ name: 'Row', kids: [card(), card(), card()] }, { name: 'Row', kids: [card(), card(), card()] }] });
  const plan = planFill([grid], adapter, null);
  assert.equal(plan.cards.length, 6);
  assert.ok(plan.cards.every((c) => c.targets.length === 3));
});

test('plan: a heading next to a list of cards', () => {
  const page = tree({ name: 'Section', kids: ['#brand', { name: 'Cards', kids: [card(), card()] }] });
  assert.deepEqual(fieldsOf(planFill([page], adapter, null)), ['brand', 'title,caliber,price', 'title,caliber,price']);
});

test('plan: a card that uses a tag twice in different parts stays one card', () => {
  const c = tree({ name: 'Card', kids: [{ name: 'Top', kids: ['#title', '#price'] }, { name: 'Bottom', kids: ['#caliber', '#price'] }] });
  assert.deepEqual(fieldsOf(planFill([c], adapter, null)), ['title,price,caliber,price']);
});

test('plan: a frame of same-tag text layers is a list', () => {
  const list = tree({ name: 'Names', kids: ['#model', '#model', '#model'] });
  assert.equal(planFill([list], adapter, null).cards.length, 3);
});

test('plan: directly selected text layers', () => {
  const parent = tree({ name: 'Card', kids: ['#title', '#price', 'Glock 17'] });
  const [title, price, plain] = parent.kids;
  // two tagged layers of one card stay together
  assert.deepEqual(fieldsOf(planFill([title, price], adapter, null)), ['title,price']);
  // an untagged one gets the field picked in the UI
  assert.deepEqual(fieldsOf(planFill([plain], adapter, 'model')), ['model']);
  // or is counted and left alone
  const off = planFill([plain], adapter, null);
  assert.equal(off.cards.length, 0);
  assert.equal(off.untagged, 1);
  // several untagged layers each get their own row
  const names = tree({ name: 'List', kids: ['Item', 'Item', 'Item'] });
  assert.equal(planFill(names.kids, adapter, 'title').cards.length, 3);
});

test('plan: unknown tags are reported, not filled', () => {
  const plan = planFill([tree({ name: 'Card', kids: ['#title', '#rating'] }), tree('#stars')], adapter, 'title');
  assert.deepEqual(fieldsOf(plan), ['title']);
  assert.deepEqual(plan.unknownTags.sort(), ['#rating', '#stars']);
});

// ---------- caliber text ----------

test('normalizeCaliberText: caliber spellings become standard names', () => {
  const cases = {
    '9mm': '9×19mm Parabellum',
    '9MM LUGER': '9×19mm Parabellum',
    '5.56 NATO': '5.56×45mm NATO',
    '12ga': '12 Gauge',
    '300 BLK': '.300 AAC Blackout',
    '6.5 CM': '6.5mm Creedmoor',
    '.45 Auto': '.45 ACP',
    '22LR': '.22 LR',
    '9mm +P': '9×19mm Parabellum +P',
    '.357 Mag / .38 Spl': '.357 Mag / .38 S&W Special',
    'Caliber: 9mm Luger': 'Caliber: 9×19mm Parabellum',
    '  12 GA ': '  12 Gauge ',
  };
  for (const [input, out] of Object.entries(cases)) assert.deepEqual(normalizeCaliberText(input), { status: 'changed', text: out }, input);
});

test('normalizeCaliberText: standard names and other text are left alone', () => {
  for (const t of ['9×19mm Parabellum', '.308 Win', '.22 S/L/LR']) assert.deepEqual(normalizeCaliberText(t), { status: 'standard' }, t);
  for (const t of ['Glock 19 Gen 5 9mm', 'Federal 9mm 115gr FMJ 50rds', 'Ruger 10/22 .22 LR', 'Add to cart', '', 'Caliber: Glock 19']) {
    assert.deepEqual(normalizeCaliberText(t), { status: 'not-caliber' }, t);
  }
});
