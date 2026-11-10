// Panel UI (runs in the plugin iframe). It only shows options and sends them to the main thread.
import type { FromUi, Settings, ToUi } from '../shared/messages';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = (msg: FromUi) => parent.postMessage({ pluginMessage: msg }, '*');

let settings: Settings | null = null;

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  o.selected = selected;
  return o;
}

function update(patch: Partial<Settings>): void {
  if (!settings) return;
  settings = { ...settings, ...patch };
  send({ type: 'settings', settings });
}

function init(msg: Extract<ToUi, { type: 'init' }>): void {
  settings = msg.settings;

  const seg = $('category');
  seg.replaceChildren(
    ...msg.categories.map((c) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'category';
      input.value = c.id;
      input.checked = c.id === msg.settings.category;
      input.addEventListener('change', () => update({ category: c.id, brand: '', caliber: '' }));
      label.append(input, c.label);
      return label;
    }),
  );

  document.querySelectorAll<HTMLInputElement>('input[name=order]').forEach((r) => {
    r.checked = r.value === msg.settings.order;
    r.addEventListener('change', () => update({ order: r.value === 'random' ? 'random' : 'popular' }));
  });

  const untagged = $<HTMLSelectElement>('untagged');
  untagged.replaceChildren(
    option('', 'Leave as is', msg.settings.untagged === ''),
    ...msg.fields.map((f) => option(f.key, f.label, f.key === msg.settings.untagged)),
  );
  untagged.addEventListener('change', () => update({ untagged: untagged.value as Settings['untagged'] }));

  $('brand').addEventListener('change', (e) => update({ brand: (e.target as HTMLSelectElement).value }));
  $('caliber').addEventListener('change', (e) => update({ caliber: (e.target as HTMLSelectElement).value }));

  const tags = $('tags');
  tags.replaceChildren(
    ...msg.fields.map((f) => {
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      a.textContent = '#' + f.key;
      const b = document.createElement('td');
      const small = document.createElement('small');
      small.textContent = f.example + (f.for === 'gun' ? ' (guns)' : f.for === 'ammo' ? ' (ammo)' : '');
      b.append(f.label, small);
      tr.append(a, b);
      return tr;
    }),
  );

  $('sample').hidden = msg.editorType !== 'figma';
  $('attribution').textContent = msg.attribution;
  $('snapshot').textContent = `, prices of ${msg.snapshot}`;
}

function filters(msg: Extract<ToUi, { type: 'filters' }>): void {
  if (!settings) return;
  const brand = $<HTMLSelectElement>('brand');
  brand.replaceChildren(
    option('', 'Any brand', !settings.brand),
    ...msg.brands.map((b) => option(b.value, `${b.value} (${b.count})`, b.value === settings!.brand)),
  );
  const caliber = $<HTMLSelectElement>('caliber');
  caliber.replaceChildren(
    option('', 'Any caliber', !settings.caliber),
    ...msg.calibers.map((c) => option(c.value, `${c.value} (${c.count})`, c.value === settings!.caliber)),
  );
}

function summary(msg: Extract<ToUi, { type: 'summary' }>): void {
  const s = msg.summary;
  const status = $('status');
  status.replaceChildren();
  if (!s.cards) {
    status.textContent = s.untagged
      ? `${s.untagged} text layer(s) selected without a #tag. Pick a field under "Untagged text".`
      : 'Select text layers, or cards with layers named #title, #caliber, #price ...';
  } else {
    status.textContent = `${s.cards} card${s.cards === 1 ? '' : 's'} · ${s.layers} text layer${s.layers === 1 ? '' : 's'} to fill`;
  }
  if (s.unknownTags.length) {
    const warn = document.createElement('div');
    warn.className = 'warn';
    warn.textContent = `Unknown tag: ${s.unknownTags.join(', ')}`;
    status.append(warn);
  }
  ($('fill') as HTMLButtonElement).disabled = !s.cards;
}

window.onmessage = (e: MessageEvent) => {
  const msg = e.data && (e.data.pluginMessage as ToUi);
  if (!msg) return;
  if (msg.type === 'init') init(msg);
  else if (msg.type === 'filters') filters(msg);
  else if (msg.type === 'summary') summary(msg);
  else if (msg.type === 'result') {
    const r = $('result');
    r.textContent = msg.message;
    r.className = 'result ' + (msg.ok ? 'ok' : 'error');
  }
};

$('fill').addEventListener('click', () => send({ type: 'fill' }));
$('sample').addEventListener('click', () => send({ type: 'sample' }));
const site = $('site');
site.addEventListener('click', () => send({ type: 'open-site' }));
site.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') send({ type: 'open-site' });
});

