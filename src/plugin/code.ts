// Gun & Ammo Data, Figma and FigJam plugin: main thread.
// Commands: "fill" opens the panel; "normalize" rewrites caliber text in the selection and closes.
import { ATTRIBUTION, SNAPSHOT } from '../core/catalog';
import { normalizeCaliberText } from '../core/caliber-text';
import { FIELDS, fieldByKey, fieldValue, parseTag, type FieldKey } from '../core/fields';
import { planFill, type NodeAdapter } from '../core/plan';
import { CATEGORIES, brandsOf, calibersOf, isCategory, rowsOf, selectRows } from '../core/select';
import type { FromUi, SelectionSummary, Settings, ToUi } from '../shared/messages';

const SITE = 'https://gunsnprices.com';
const DEFAULTS: Settings = { category: 'handguns', brand: '', caliber: '', order: 'popular', untagged: 'title' };

type TextLike = TextNode | TextSublayerNode;

/** the text a layer holds: a text layer, or the text of a FigJam sticky or shape */
function textOf(node: SceneNode): TextLike | null {
  if (node.type === 'TEXT') return node;
  if (node.type === 'STICKY' || node.type === 'SHAPE_WITH_TEXT') return node.text;
  return null;
}

const adapter: NodeAdapter<SceneNode> = {
  isText: (n) => textOf(n) !== null,
  children: (n) => ('children' in n ? n.children : null),
  tag: (n) => parseTag(n.name, n.type === 'TEXT' && !n.autoRename),
  parentKey: (n) => (n.parent ? n.parent.id : ''),
  position: (n) => ('absoluteTransform' in n ? { x: n.absoluteTransform[0][2], y: n.absoluteTransform[1][2] } : null),
};

// ---------- settings ----------

let settings: Settings = DEFAULTS;

function clean(s: Partial<Settings> | undefined): Settings {
  const v = { ...DEFAULTS, ...(s || {}) };
  return {
    category: isCategory(v.category) ? v.category : DEFAULTS.category,
    brand: typeof v.brand === 'string' ? v.brand : '',
    caliber: typeof v.caliber === 'string' ? v.caliber : '',
    order: v.order === 'random' ? 'random' : 'popular',
    untagged: v.untagged === '' || fieldByKey(v.untagged) ? v.untagged : DEFAULTS.untagged,
  };
}

async function loadSettings(): Promise<Settings> {
  try {
    return clean(await figma.clientStorage.getAsync('settings'));
  } catch {
    return DEFAULTS;
  }
}

// ---------- writing text ----------

interface Write {
  text: TextLike;
  value: string;
}

function fontsOf(t: TextLike): FontName[] {
  if (t.fontName !== figma.mixed) return [t.fontName];
  return t.getRangeAllFontNames(0, t.characters.length);
}

/** loads every font once, then sets the text; layers with a missing font are skipped */
async function writeAll(writes: Write[]): Promise<{ written: number; missingFont: number }> {
  const ok = writes.filter((w) => !w.text.hasMissingFont);
  const fonts = new Map<string, FontName>();
  for (const w of ok) for (const f of fontsOf(w.text)) fonts.set(`${f.family}\u0000${f.style}`, f);
  await Promise.all([...fonts.values()].map((f) => figma.loadFontAsync(f)));
  for (const w of ok) w.text.characters = w.value;
  return { written: ok.length, missingFont: writes.length - ok.length };
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------- fill ----------

function summarize(): SelectionSummary {
  const plan = planFill(figma.currentPage.selection, adapter, settings.untagged || null);
  return {
    cards: plan.cards.length,
    layers: plan.cards.reduce((n, c) => n + c.targets.length, 0),
    unknownTags: plan.unknownTags,
    untagged: plan.untagged,
  };
}

async function fillSelection(s: Settings, seed: number): Promise<{ ok: boolean; message: string }> {
  const plan = planFill(figma.currentPage.selection, adapter, s.untagged || null);
  if (!plan.cards.length) {
    const why = plan.unknownTags.length
      ? `Unknown tag ${plan.unknownTags.join(', ')}. Use #title, #model, #caliber, #price ...`
      : plan.untagged
        ? 'Pick a field for untagged text layers, or name the layers #title, #caliber, #price ...'
        : 'Select text layers, or cards with text layers named #title, #model, #caliber, #price ...';
    return { ok: false, message: why };
  }
  const picked = selectRows(plan.cards.length, { category: s.category, brand: s.brand, caliber: s.caliber, order: s.order, seed });
  if (!picked.available) return { ok: false, message: 'Nothing matches this brand and caliber. Choose "Any".' };

  const writes: Write[] = [];
  let notForCategory = 0;
  plan.cards.forEach((card, i) => {
    for (const t of card.targets) {
      const value = fieldValue(t.field, picked.rows[i]);
      const text = textOf(t.node);
      if (value === null || !text) notForCategory++;
      else writes.push({ text, value });
    }
  });
  const { written, missingFont } = await writeAll(writes);

  const category = CATEGORIES.find((c) => c.id === s.category)!.label.toLowerCase();
  const notes: string[] = [];
  if (picked.available < plan.cards.length) notes.push(`only ${picked.available} distinct, so rows repeat`);
  if (notForCategory) notes.push(`${plural(notForCategory, 'layer')} skipped: field not used for ${category}`);
  if (missingFont) notes.push(`${plural(missingFont, 'layer')} skipped: missing font`);
  if (plan.unknownTags.length) notes.push(`unknown ${plan.unknownTags.join(', ')}`);
  const message = `Filled ${plural(written, 'layer')} in ${plural(plan.cards.length, 'card')} with ${category}` + (notes.length ? ` (${notes.join('; ')})` : '');
  return { ok: written > 0, message };
}

// ---------- sample cards ----------

const GUN_CARD: [FieldKey, 'Regular' | 'Bold', number][] = [
  ['brand', 'Regular', 12], ['title', 'Bold', 14], ['specs', 'Regular', 12], ['price', 'Bold', 20], ['from', 'Regular', 12],
];
const AMMO_CARD: [FieldKey, 'Regular' | 'Bold', number][] = [
  ['brand', 'Regular', 12], ['title', 'Bold', 14], ['caliber', 'Regular', 12], ['price', 'Bold', 20], ['cpr', 'Regular', 12],
];
const gray = (v: number): SolidPaint => ({ type: 'SOLID', color: { r: v, g: v, b: v } });

/** three cards whose text layers are named with tags, filled right away; Figma Design only */
async function createSampleCards(s: Settings, seed: number): Promise<{ ok: boolean; message: string }> {
  if (figma.editorType !== 'figma') return { ok: false, message: 'Sample cards can be created in Figma Design files.' };
  await Promise.all([figma.loadFontAsync({ family: 'Inter', style: 'Regular' }), figma.loadFontAsync({ family: 'Inter', style: 'Bold' })]);
  const list = figma.createFrame();
  list.name = 'Product cards (Gun & Ammo Data sample)';
  list.layoutMode = 'HORIZONTAL';
  list.primaryAxisSizingMode = 'AUTO';
  list.counterAxisSizingMode = 'AUTO';
  list.itemSpacing = 16;
  list.fills = [];
  for (let i = 0; i < 3; i++) {
    const card = figma.createFrame();
    card.name = 'Card';
    card.layoutMode = 'VERTICAL';
    card.primaryAxisSizingMode = 'AUTO';
    card.counterAxisSizingMode = 'FIXED';
    card.resize(240, card.height);
    card.itemSpacing = 6;
    card.paddingTop = card.paddingBottom = card.paddingLeft = card.paddingRight = 16;
    card.cornerRadius = 8;
    card.fills = [gray(1)];
    card.strokes = [gray(0.87)];
    const image = figma.createRectangle();
    image.name = 'Image';
    image.resize(208, 140);
    image.cornerRadius = 4;
    image.fills = [gray(0.94)];
    card.appendChild(image);
    for (const [field, style, size] of s.category === 'ammo' ? AMMO_CARD : GUN_CARD) {
      const t = figma.createText();
      t.fontName = { family: 'Inter', style };
      t.fontSize = size;
      t.characters = fieldByKey(field)!.label;
      t.name = '#' + field;
      t.fills = [gray(style === 'Bold' ? 0.07 : 0.4)];
      card.appendChild(t);
      t.layoutAlign = 'STRETCH';
      t.textAutoResize = 'HEIGHT';
    }
    list.appendChild(card);
  }
  const c = figma.viewport.center;
  list.x = Math.round(c.x - list.width / 2);
  list.y = Math.round(c.y - list.height / 2);
  figma.currentPage.appendChild(list);
  figma.currentPage.selection = [list];
  figma.viewport.scrollAndZoomIntoView([list]);
  return fillSelection(s, seed);
}

// ---------- normalize caliber text ----------

async function normalizeSelection(): Promise<string> {
  const texts: TextLike[] = [];
  const visit = (n: SceneNode): void => {
    const t = textOf(n);
    if (t) texts.push(t);
    else if ('children' in n) n.children.forEach(visit);
  };
  figma.currentPage.selection.forEach(visit);
  if (!texts.length) return 'Select text layers with caliber names, or frames that contain them.';

  const writes: Write[] = [];
  let standard = 0;
  let other = 0;
  for (const text of texts) {
    const r = normalizeCaliberText(text.characters);
    if (r.status === 'changed') writes.push({ text, value: r.text });
    else if (r.status === 'standard') standard++;
    else other++;
  }
  const { written, missingFont } = await writeAll(writes);
  const parts = [`Normalized ${plural(written, 'caliber')}`];
  if (standard) parts.push(`${standard} already standard`);
  if (other) parts.push(`${plural(other, 'layer')} not a caliber, left as is`);
  if (missingFont) parts.push(`${plural(missingFont, 'layer')} skipped: missing font`);
  return parts.join(', ');
}

// ---------- panel ----------

function post(msg: ToUi): void {
  figma.ui.postMessage(msg);
}

function postFilters(): void {
  const all = rowsOf(settings.category);
  post({
    type: 'filters',
    brands: brandsOf(settings.category, settings.caliber),
    calibers: calibersOf(settings.category, settings.brand),
    rows: all.filter((r) => (!settings.brand || r.brand === settings.brand) && (!settings.caliber || r.caliber === settings.caliber)).length,
  });
}

async function openPanel(): Promise<void> {
  settings = await loadSettings();
  figma.showUI(__html__, { width: 320, height: 480, themeColors: true, title: 'Gun & Ammo Data' });
  post({
    type: 'init',
    settings,
    categories: CATEGORIES.slice(),
    fields: FIELDS.map((f) => ({ key: f.key, label: f.label, example: f.example, for: f.for })),
    editorType: figma.editorType,
    snapshot: SNAPSHOT,
    attribution: ATTRIBUTION,
  });
  postFilters();
  post({ type: 'summary', summary: summarize() });

  const onSelection = () => post({ type: 'summary', summary: summarize() });
  figma.on('selectionchange', onSelection);
  figma.on('currentpagechange', onSelection);

  figma.ui.onmessage = async (msg: FromUi) => {
    try {
      if (msg.type === 'settings') {
        settings = clean(msg.settings);
        await figma.clientStorage.setAsync('settings', settings);
        postFilters();
        onSelection();
      } else if (msg.type === 'fill' || msg.type === 'sample') {
        const seed = Date.now() % 2147483647;
        const r = msg.type === 'fill' ? await fillSelection(settings, seed) : await createSampleCards(settings, seed);
        figma.notify(r.message, { error: !r.ok });
        post({ type: 'result', ...r });
        onSelection();
      } else if (msg.type === 'open-site') {
        figma.openExternal(SITE);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      figma.notify(message, { error: true });
      post({ type: 'result', ok: false, message });
    }
  };
}

if (figma.command === 'normalize') {
  normalizeSelection().then(
    (message) => figma.closePlugin(message),
    (e) => figma.closePlugin(e instanceof Error ? e.message : String(e)),
  );
} else {
  openPanel();
}
