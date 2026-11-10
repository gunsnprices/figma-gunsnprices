// The built plugin (dist/code.js) against a mock of the Figma API: panel messages, fill, sample cards, normalize.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFigma, runPlugin } from './figma-mock.mjs';
import { GUNS, AMMO, rowsOf } from '../out/core.mjs';

const card = (m, x = 0, y = 0) =>
  m.frame('Card', [m.text('Name', '#title'), m.text('9mm', '#caliber'), m.text('$0', 'Price #price'), m.text('$0.00/rd', '#cpr'), m.text('Add to cart')], { x, y });
// objects made inside the vm have other prototypes; compare their JSON
const plain = (o) => JSON.parse(JSON.stringify(o));
const texts = (frame) => Object.fromEntries(frame.children.map((t) => [t.name, t.characters]));

test('manifest: offline, dynamic-page, Figma and FigJam, two commands', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(m.networkAccess, { allowedDomains: ['none'] });
  assert.equal(m.documentAccess, 'dynamic-page');
  assert.deepEqual(m.editorType, ['figma', 'figjam']);
  assert.deepEqual(m.menu.map((c) => c.command), ['fill', 'normalize']);
  for (const f of [m.main, m.ui]) assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)), f);
});

test('bundle: no network APIs in the plugin code or the panel', () => {
  for (const f of ['dist/code.js', 'dist/ui.html']) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|<script src=|<link [^>]*href="http/, f);
  }
});

test('panel: opens with init, filters and a selection summary', async () => {
  const m = await runPlugin(createFigma());
  assert.equal(m.log.showUI.html, '<html>panel</html>');
  assert.equal(m.log.showUI.opts.themeColors, true);
  const init = m.lastUi('init');
  assert.equal(init.settings.category, 'handguns');
  assert.equal(init.editorType, 'figma');
  assert.equal(init.attribution, 'Data: GunsNPrices (gunsnprices.com), CC BY 4.0');
  assert.equal(m.lastUi('filters').rows, rowsOf('handguns').length);
  assert.equal(m.lastUi('summary').summary.cards, 0);

  m.select(card(m), card(m, 300));
  assert.deepEqual(plain(m.lastUi('summary').summary), { cards: 2, layers: 8, unknownTags: [], untagged: 0 });
});

test('fill: each card gets its own handgun; fields of one card match; ammo-only fields are skipped', async () => {
  const m = await runPlugin(createFigma());
  const cards = [card(m, 600), card(m, 0), card(m, 300)];
  m.select(...cards);
  await m.fromUi({ type: 'fill' });

  const result = m.lastUi('result');
  assert.equal(result.ok, true);
  assert.match(result.message, /^Filled 9 layers in 3 cards with handguns \(3 layers skipped: field not used for handguns\)$/);
  assert.equal(m.log.notify.at(-1).message, result.message);

  const top = rowsOf('handguns').slice(0, 3);
  // reading order: left to right
  [cards[1], cards[2], cards[0]].forEach((c, i) => {
    const t = texts(c);
    const row = GUNS.find((g) => g.title === t['#title']);
    assert.equal(row, top[i]);
    assert.equal(t['#caliber'], row.caliber);
    assert.match(t['Price #price'], /^\$[\d,]+\.\d\d$/);
    assert.equal(t['#cpr'], '$0.00/rd'); // not a handgun field: unchanged
    assert.equal(t['Add to cart'], 'Add to cart'); // untagged inside a card: unchanged
  });
});

test('fill: ammo with a caliber filter, random order; settings are stored', async () => {
  const storage = {};
  const m = await runPlugin(createFigma({ storage }));
  const settings = { category: 'ammo', brand: '', caliber: '12 Gauge', order: 'random', untagged: 'title' };
  await m.fromUi({ type: 'settings', settings });
  assert.deepEqual(plain(storage.settings), settings);
  assert.ok(m.lastUi('filters').brands.length > 1);

  const cards = [card(m), card(m, 300), card(m, 600), card(m, 900)];
  m.select(...cards);
  await m.fromUi({ type: 'fill' });
  assert.equal(m.lastUi('result').ok, true);
  const titles = new Set();
  for (const c of cards) {
    const t = texts(c);
    const box = AMMO.find((a) => a.title === t['#title']);
    assert.ok(box, t['#title']);
    assert.equal(t['#caliber'], '12 Gauge');
    assert.match(t['#cpr'], /^\$\d+\.\d\d\/rd$/);
    titles.add(box.title);
  }
  assert.equal(titles.size, 4);
});

test('fill: settings survive a restart', async () => {
  const storage = { settings: { category: 'rifles', brand: 'Ruger', caliber: '', order: 'popular', untagged: '' } };
  const m = await runPlugin(createFigma({ storage }));
  assert.deepEqual(plain(m.lastUi('init').settings), storage.settings);
  const t = m.text('Name', '#model');
  m.select(t);
  await m.fromUi({ type: 'fill' });
  assert.equal(t.characters, rowsOf('rifles').find((r) => r.brand === 'Ruger').model);
});

test('fill: untagged selected text layers get the picked field, each its own row', async () => {
  const m = await runPlugin(createFigma());
  const list = m.frame('List', [m.text('a'), m.text('b'), m.text('c')]);
  m.select(...list.children);
  await m.fromUi({ type: 'settings', settings: { category: 'shotguns', brand: '', caliber: '', order: 'popular', untagged: 'model' } });
  await m.fromUi({ type: 'fill' });
  assert.deepEqual(list.children.map((t) => t.characters), rowsOf('shotguns').slice(0, 3).map((r) => r.model));
});

test('fill: mixed fonts are all loaded; layers with a missing font are skipped', async () => {
  const m = await runPlugin(createFigma());
  const mixed = m.text('Mixed', '#brand', { fontName: m.figma.mixed, ranges: [{ family: 'Roboto', style: 'Bold' }, { family: 'Roboto', style: 'Italic' }] });
  const missing = m.text('Missing', '#model', { missingFont: true });
  m.select(m.frame('Card', [mixed, missing]));
  await m.fromUi({ type: 'fill' });
  assert.equal(mixed.characters, rowsOf('handguns')[0].brand);
  assert.equal(missing.characters, 'Missing');
  assert.match(m.lastUi('result').message, /1 layer skipped: missing font/);
  assert.ok(m.loaded.has('Roboto/Italic'));
});

test('fill: nothing to fill, unknown tag, no matching rows', async () => {
  const m = await runPlugin(createFigma());
  m.select(m.frame('Empty', [m.text('Hello')]));
  await m.fromUi({ type: 'fill' });
  assert.equal(m.lastUi('result').ok, false);
  assert.equal(m.log.notify.at(-1).error, true);

  m.select(m.frame('Card', [m.text('x', '#rating')]));
  await m.fromUi({ type: 'fill' });
  assert.match(m.lastUi('result').message, /Unknown tag #rating/);

  await m.fromUi({ type: 'settings', settings: { category: 'ammo', brand: 'Glock', caliber: '', order: 'popular', untagged: 'title' } });
  m.select(card(m));
  await m.fromUi({ type: 'fill' });
  assert.match(m.lastUi('result').message, /Nothing matches/);
});

test('sample cards: three tagged cards, filled, selected (Figma Design only)', async () => {
  const m = await runPlugin(createFigma());
  await m.fromUi({ type: 'sample' });
  const list = m.page.selection[0];
  assert.equal(list.children.length, 3);
  const names = list.children[0].children.filter((n) => n.type === 'TEXT').map((n) => n.name);
  assert.deepEqual(names, ['#brand', '#title', '#specs', '#price', '#from']);
  const titles = list.children.map((c) => c.children.find((n) => n.name === '#title').characters);
  assert.deepEqual(titles, rowsOf('handguns').slice(0, 3).map((r) => r.title));
  assert.equal(m.lastUi('result').ok, true);

  const jam = await runPlugin(createFigma({ editorType: 'figjam' }));
  assert.equal(jam.lastUi('init').editorType, 'figjam');
  await jam.fromUi({ type: 'sample' });
  assert.equal(jam.lastUi('result').ok, false);
});

test('FigJam: stickies are filled like text layers', async () => {
  const m = await runPlugin(createFigma({ editorType: 'figjam' }));
  const notes = [m.sticky('one', { x: 0 }), m.sticky('two', { x: 200 })];
  m.select(...notes);
  await m.fromUi({ type: 'settings', settings: { category: 'ammo', brand: '', caliber: '', order: 'popular', untagged: 'title' } });
  await m.fromUi({ type: 'fill' });
  assert.deepEqual(notes.map((n) => n.text.characters), rowsOf('ammo').slice(0, 2).map((r) => r.title));
});

test('open-site opens gunsnprices.com in the browser', async () => {
  const m = await runPlugin(createFigma());
  await m.fromUi({ type: 'open-site' });
  assert.deepEqual(plain(m.log.external), ['https://gunsnprices.com']);
});

test('normalize command: rewrites caliber text in the selection and closes', async () => {
  const m = createFigma({ command: 'normalize' });
  const a = m.text('9MM LUGER'), b = m.text('Glock 19 Gen 5 9mm'), c = m.text('12ga'), d = m.text('.308 Win');
  m.select(m.frame('Specs', [a, b]), c, d);
  await runPlugin(m);
  assert.deepEqual([a, b, c, d].map((t) => t.characters), ['9×19mm Parabellum', 'Glock 19 Gen 5 9mm', '12 Gauge', '.308 Win']);
  assert.equal(m.log.closed, 'Normalized 2 calibers, 1 already standard, 1 layer not a caliber, left as is');
  assert.equal(m.log.showUI, null);
});

test('normalize command: empty selection', async () => {
  const m = await runPlugin(createFigma({ command: 'normalize' }));
  assert.match(m.log.closed, /^Select text layers/);
});
