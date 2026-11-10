// Prints, as JSON, the values the plugin would write into the cover's mock cards (the first row of each category,
// "Popular first"). Used by scripts/render_assets.py, so the cover shows real plugin output. Needs out/core.mjs.
import { rowsOf, fieldValue, SNAPSHOT, ATTRIBUTION } from '../out/core.mjs';

const card = (category, fields) => {
  const row = rowsOf(category)[0];
  return { category, values: Object.fromEntries(fields.map((f) => [f, fieldValue(f, row)])) };
};
const gun = ['brand', 'title', 'specs', 'price', 'from'];
const ammo = ['brand', 'title', 'caliber', 'price', 'cpr'];
console.log(
  JSON.stringify({
    snapshot: SNAPSHOT,
    attribution: ATTRIBUTION,
    cards: [card('handguns', gun), card('rifles', gun), card('shotguns', gun), card('ammo', ammo)],
  }),
);
