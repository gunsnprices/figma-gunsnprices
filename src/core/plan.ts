// Turning a selection into "cards": groups of text layers that get their values from the same row.
//
// Rules (also in the README):
// 1. Inside a selected frame, group, component or instance, only tagged text layers are filled.
// 2. A container is one card, unless it uses the same tag more than once AND looks like a list: two of its children
//    carry the same set of tags, or a child itself repeats a tag. Then each child is processed the same way, so
//    a grid -> rows -> cards structure gives one card per card.
// 3. Text layers selected directly: untagged ones get the field picked in the UI. Selected text layers that share
//    a parent form one card, unless a field repeats among them; then each is its own card (a list of names).
// 4. Cards are filled in reading order: top to bottom, then left to right, when positions are known.
import type { FieldKey, Tag } from './fields';

export interface NodeAdapter<N> {
  /** a layer whose text can be set (text layer, FigJam sticky or shape with text) */
  isText(node: N): boolean;
  /** child layers, or null for leaves */
  children(node: N): readonly N[] | null;
  tag(node: N): Tag;
  parentKey(node: N): string;
  /** top-left corner on the canvas, if known */
  position(node: N): { x: number; y: number } | null;
}

export interface Target<N> {
  node: N;
  field: FieldKey;
}

export interface Card<N> {
  targets: Target<N>[];
}

export interface Plan<N> {
  cards: Card<N>[];
  /** tags that are not field names, e.g. "#foo" */
  unknownTags: string[];
  /** selected text layers without a tag, when no field was picked for them */
  untagged: number;
}

export function planFill<N>(selection: readonly N[], a: NodeAdapter<N>, untaggedField: FieldKey | null): Plan<N> {
  const unknown = new Set<string>();
  let untagged = 0;

  const fieldOf = (n: N): FieldKey | null => {
    const t = a.tag(n);
    if (!t) return null;
    if ('unknown' in t) {
      unknown.add('#' + t.unknown);
      return null;
    }
    return t.field;
  };

  const tagged = (n: N): Target<N>[] => {
    if (a.isText(n)) {
      const f = fieldOf(n);
      return f ? [{ node: n, field: f }] : [];
    }
    return (a.children(n) ?? []).flatMap(tagged);
  };

  const cardsIn = (n: N): Card<N>[] => {
    const targets = tagged(n);
    if (!targets.length) return [];
    if (a.isText(n) || !repeats(targets)) return [{ targets }];
    const groups = (a.children(n) ?? []).map((c) => ({ c, t: tagged(c), pos: a.position(c) })).filter((g) => g.t.length);
    const sigs = groups.map((g) => signature(g.t));
    const isList = sigs.some((s, i) => sigs.indexOf(s) !== i) || groups.some((g) => repeats(g.t));
    if (!isList) return [{ targets }];
    return readingOrder(groups).flatMap((g) => cardsIn(g.c));
  };

  const found: { cards: Card<N>[]; pos: { x: number; y: number } | null }[] = [];

  // directly selected text layers, by parent
  const byParent = new Map<string, { n: N; field: FieldKey }[]>();
  for (const n of selection) {
    if (!a.isText(n)) continue;
    const own = a.tag(n);
    const field = own ? fieldOf(n) : untaggedField; // a layer with an unknown #tag is left alone
    if (!field) {
      if (!own) untagged++;
      continue;
    }
    const k = a.parentKey(n);
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push({ n, field });
  }
  for (const list of byParent.values()) {
    const targets = list.map(({ n, field }) => ({ node: n, field }));
    if (repeats(targets)) for (const t of targets) found.push({ cards: [{ targets: [t] }], pos: a.position(t.node) });
    else found.push({ cards: [{ targets }], pos: a.position(targets[0].node) });
  }

  for (const n of selection) if (!a.isText(n)) found.push({ cards: cardsIn(n), pos: a.position(n) });

  return { cards: readingOrder(found).flatMap((f) => f.cards), unknownTags: [...unknown], untagged };
}

/** top to bottom, then left to right; the original order when a position is missing */
function readingOrder<T extends { pos: { x: number; y: number } | null }>(items: T[]): T[] {
  if (!items.every((i) => i.pos)) return items;
  return items.slice().sort((p, q) => {
    const dy = p.pos!.y - q.pos!.y;
    return Math.abs(dy) > 8 ? dy : p.pos!.x - q.pos!.x; // 8 px: a slightly uneven row is still a row
  });
}

function repeats<N>(targets: Target<N>[]): boolean {
  const seen = new Set<FieldKey>();
  for (const t of targets) {
    if (seen.has(t.field)) return true;
    seen.add(t.field);
  }
  return false;
}

function signature<N>(targets: Target<N>[]): string {
  return [...new Set(targets.map((t) => t.field))].sort().join(',');
}
