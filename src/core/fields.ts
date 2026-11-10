// Fields a text layer can be filled with, the layer-name tags that ask for them, and how values are written.
import type { Row } from './catalog';

export type FieldKey =
  | 'title'
  | 'brand'
  | 'model'
  | 'family'
  | 'caliber'
  | 'type'
  | 'price'
  | 'price-min'
  | 'from'
  | 'capacity'
  | 'barrel'
  | 'rounds'
  | 'cpr'
  | 'cpr-cents'
  | 'specs';

export interface FieldDef {
  key: FieldKey;
  label: string;
  /** other tags accepted for this field */
  aliases: string[];
  /** example value, for the help list in the UI */
  example: string;
  /** "gun", "ammo" or both */
  for: 'gun' | 'ammo' | 'both';
}

export const FIELDS: readonly FieldDef[] = [
  { key: 'title', label: 'Product title', aliases: ['name', 'product', 'product-title', 'product-name'], example: 'Glock 19 Gen 5 9mm 4.02" 15rd Pistol', for: 'both' },
  { key: 'brand', label: 'Brand', aliases: ['manufacturer', 'maker', 'make', 'mfr'], example: 'Glock', for: 'both' },
  { key: 'model', label: 'Model', aliases: [], example: 'Glock 19 Gen 5', for: 'gun' },
  { key: 'family', label: 'Model family', aliases: ['series', 'model-family'], example: 'Glock 19', for: 'gun' },
  { key: 'caliber', label: 'Caliber', aliases: ['calibre', 'cal', 'chambering', 'cartridge'], example: '9×19mm Parabellum', for: 'both' },
  { key: 'type', label: 'Type', aliases: ['category', 'kind'], example: 'Handgun', for: 'both' },
  { key: 'price', label: 'Price', aliases: ['cost', 'sale-price'], example: '$757.49', for: 'both' },
  { key: 'price-min', label: 'Lowest price', aliases: ['min-price', 'low-price', 'lowest-price', 'best-price'], example: '$500.99', for: 'both' },
  { key: 'from', label: '"From" price', aliases: ['price-from', 'from-price', 'starting-at'], example: 'From $500.99', for: 'both' },
  { key: 'capacity', label: 'Capacity', aliases: ['cap', 'mag', 'magazine', 'mag-capacity', 'magazine-capacity'], example: '15 rounds', for: 'gun' },
  { key: 'barrel', label: 'Barrel length', aliases: ['barrel-length', 'bbl'], example: '4.02"', for: 'gun' },
  { key: 'rounds', label: 'Rounds per box', aliases: ['count', 'qty', 'quantity', 'rounds-per-box', 'rpb', 'box'], example: '50 rounds', for: 'ammo' },
  { key: 'cpr', label: 'Cost per round', aliases: ['cost-per-round', 'price-per-round', 'ppr', 'per-round'], example: '$0.43/rd', for: 'ammo' },
  { key: 'cpr-cents', label: 'Cost per round, cents', aliases: ['cents-per-round'], example: '43¢/rd', for: 'ammo' },
  { key: 'specs', label: 'Spec line', aliases: ['spec', 'subtitle', 'details'], example: '9×19mm Parabellum · 4.02" · 15 rounds', for: 'both' },
];

const BY_NAME = new Map<string, FieldKey>();
for (const f of FIELDS) {
  BY_NAME.set(f.key, f.key);
  for (const a of f.aliases) BY_NAME.set(a, f.key);
  BY_NAME.set(slug(f.label), f.key);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function fieldByKey(key: string): FieldDef | undefined {
  return FIELDS.find((f) => f.key === key);
}

export type Tag = { field: FieldKey } | { unknown: string } | null;

/**
 * What a layer name asks for.
 * - `#price`, `Price #price`, `#cost-per-round` ... : the first `#tag` in the name.
 * - a layer renamed by hand to just a field name (`Price`, `Cost per round`), when `renamed` is true.
 *   Text layers that still carry their automatic name (their own text) are not read this way.
 */
export function parseTag(name: string, renamed = false): Tag {
  const m = /#([a-z][a-z0-9_-]*)/i.exec(name);
  if (m) {
    const field = BY_NAME.get(slug(m[1]));
    return field ? { field } : { unknown: m[1] };
  }
  if (renamed) {
    const field = BY_NAME.get(slug(name));
    if (field) return { field };
  }
  return null;
}

// ---------- values ----------

/** $1,670.99 (no Intl: the Figma plugin sandbox doesn't promise it) */
export function money(v: number): string {
  const [int, dec] = v.toFixed(2).split('.');
  return '$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

/** $0.43/rd; $1.38/rd */
export function costPerRoundText(price: number, rounds: number): string {
  return money(price / rounds) + '/rd';
}

/** 43¢/rd, 6.5¢/rd; a dollar or more stays in dollars */
export function costPerRoundCents(price: number, rounds: number): string {
  const cents = (price / rounds) * 100;
  if (cents >= 100) return costPerRoundText(price, rounds);
  return (cents < 10 ? (Math.round(cents * 10) / 10).toString() : Math.round(cents).toString()) + '¢/rd';
}

function inches(v: number): string {
  return `${v}"`;
}

const GUN_TYPE_LABEL = { handgun: 'Handgun', rifle: 'Rifle', shotgun: 'Shotgun' };
const AMMO_TYPE_LABEL = { handgun: 'Handgun ammo', rifle: 'Rifle ammo', rimfire: 'Rimfire ammo', shotgun: 'Shotgun shells' };

/** the text for a field, or null when the row doesn't have it (capacity of an ammo box, cost per round of a rifle) */
export function fieldValue(field: FieldKey, row: Row): string | null {
  if (row.kind === 'gun') {
    switch (field) {
      case 'title': return row.title;
      case 'brand': return row.brand;
      case 'model': return row.model;
      case 'family': return row.family;
      case 'caliber': return row.caliber;
      case 'type': return GUN_TYPE_LABEL[row.type];
      case 'price': return money(row.priceMedian);
      case 'price-min': return money(row.priceMin ?? row.priceMedian);
      case 'from': return 'From ' + money(row.priceMin ?? row.priceMedian);
      case 'capacity': return `${row.capacity} rounds`;
      case 'barrel': return inches(row.barrel);
      case 'specs': return `${row.caliber} · ${inches(row.barrel)} · ${row.capacity} rounds`;
      default: return null;
    }
  }
  switch (field) {
    case 'title': return row.title;
    case 'brand': return row.brand;
    case 'caliber': return row.caliber;
    case 'type': return AMMO_TYPE_LABEL[row.caliberType];
    case 'price':
    case 'price-min': return money(row.price);
    case 'from': return 'From ' + money(row.price);
    case 'rounds': return `${row.rounds} rounds`;
    case 'cpr': return costPerRoundText(row.price, row.rounds);
    case 'cpr-cents': return costPerRoundCents(row.price, row.rounds);
    case 'specs': return `${row.caliber} · ${row.rounds} rounds · ${costPerRoundText(row.price, row.rounds)}`;
    default: return null;
  }
}
