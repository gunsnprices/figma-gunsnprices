// Picking rows for a fill: category, optional brand and caliber filters, popular-first or shuffled order.
import { AMMO, GUNS, type Row } from './catalog';

export type Category = 'handguns' | 'rifles' | 'shotguns' | 'ammo';
export type Order = 'popular' | 'random';

export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: 'handguns', label: 'Handguns' },
  { id: 'rifles', label: 'Rifles' },
  { id: 'shotguns', label: 'Shotguns' },
  { id: 'ammo', label: 'Ammo' },
];

const GUN_TYPE = { handguns: 'handgun', rifles: 'rifle', shotguns: 'shotgun' } as const;

export function isCategory(v: unknown): v is Category {
  return v === 'handguns' || v === 'rifles' || v === 'shotguns' || v === 'ammo';
}

/** every row of a category, in popular-first order */
export function rowsOf(category: Category): readonly Row[] {
  if (category === 'ammo') return ammoPopularOrder();
  const type = GUN_TYPE[category];
  return GUNS.filter((g) => g.type === type);
}

let ammoCache: Row[] | null = null;
// AMMO is grouped by caliber (most listed caliber first). Popular order takes one box of each caliber in turn,
// so that a grid of cards shows 9mm, 12 Gauge, .223 ... instead of 24 boxes of 9mm.
function ammoPopularOrder(): Row[] {
  if (ammoCache) return ammoCache;
  const groups: Row[][] = [];
  const index = new Map<string, number>();
  for (const a of AMMO) {
    if (!index.has(a.caliber)) {
      index.set(a.caliber, groups.length);
      groups.push([]);
    }
    groups[index.get(a.caliber)!].push(a);
  }
  const out: Row[] = [];
  for (let i = 0; out.length < AMMO.length; i++) for (const g of groups) if (i < g.length) out.push(g[i]);
  return (ammoCache = out);
}

export interface FilterOption {
  value: string;
  count: number;
}

/** brands in a category with their row counts, most rows first */
export function brandsOf(category: Category, caliber = ''): FilterOption[] {
  return countBy(rowsOf(category).filter((r) => !caliber || r.caliber === caliber), (r) => r.brand);
}

/** calibers in a category with their row counts, most rows first */
export function calibersOf(category: Category, brand = ''): FilterOption[] {
  return countBy(rowsOf(category).filter((r) => !brand || r.brand === brand), (r) => r.caliber);
}

function countBy(rows: readonly Row[], key: (r: Row) => string): FilterOption[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) || 0) + 1);
  return [...m.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export interface SelectOptions {
  category: Category;
  brand?: string;
  caliber?: string;
  order?: Order;
  /** seed for the random order; the same seed gives the same rows */
  seed?: number;
}

export interface Selection {
  rows: Row[];
  /** rows that match the filters; when fewer than asked for, rows repeat */
  available: number;
}

/** `count` rows for `count` cards: distinct while the filters allow, then repeating from the start */
export function selectRows(count: number, opts: SelectOptions): Selection {
  let pool = rowsOf(opts.category).filter(
    (r) => (!opts.brand || r.brand === opts.brand) && (!opts.caliber || r.caliber === opts.caliber),
  );
  if (opts.order === 'random') pool = shuffle(pool, opts.seed ?? 1);
  const rows: Row[] = [];
  if (pool.length) for (let i = 0; i < count; i++) rows.push(pool[i % pool.length]);
  return { rows, available: pool.length };
}

/** Fisher–Yates with a small seeded generator (mulberry32), so tests and repeated runs are reproducible */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const a = items.slice();
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
