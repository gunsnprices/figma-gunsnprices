// Messages between the plugin (main thread) and its UI (iframe). Types only.
import type { FieldKey } from '../core/fields';
import type { Category, FilterOption, Order } from '../core/select';

export interface Settings {
  category: Category;
  brand: string;
  caliber: string;
  order: Order;
  /** field for selected text layers that have no #tag; "" leaves them alone */
  untagged: FieldKey | '';
}

export interface SelectionSummary {
  cards: number;
  layers: number;
  unknownTags: string[];
  /** selected text layers without a tag, when "untagged" is off */
  untagged: number;
}

export type ToUi =
  | {
      type: 'init';
      settings: Settings;
      categories: { id: Category; label: string }[];
      fields: { key: FieldKey; label: string; example: string; for: 'gun' | 'ammo' | 'both' }[];
      editorType: string;
      snapshot: string;
      attribution: string;
    }
  | { type: 'filters'; brands: FilterOption[]; calibers: FilterOption[]; rows: number }
  | { type: 'summary'; summary: SelectionSummary }
  | { type: 'result'; ok: boolean; message: string };

export type FromUi =
  | { type: 'settings'; settings: Settings }
  | { type: 'fill' }
  | { type: 'sample' }
  | { type: 'open-site' };
