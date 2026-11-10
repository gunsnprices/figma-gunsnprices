# Changelog

## 0.1.0 (2026-11-10)

- First release, for Figma Design and FigJam.
- **Fill with gun & ammo data**: fills text layers named `#title`, `#brand`, `#model`, `#family`, `#caliber`, `#type`,
  `#price`, `#price-min`, `#from`, `#capacity`, `#barrel`, `#rounds`, `#cpr`, `#cpr-cents` and `#specs` with handguns,
  rifles, shotguns or ammo. One row per card, the same row for every layer of a card; lists and grids of cards are
  found automatically. Brand and caliber filters, popular-first or random order, a field for untagged text layers,
  and three sample cards to start from.
- **Normalize caliber text**: rewrites caliber spellings as standard names (293 calibers) and leaves other text alone.
- Data: 2,105 firearm models, 736 ammo boxes and 284 calibers from the GunsNPrices catalog of 2026-10-12, bundled.
  No network access, no telemetry.
- Built on the [`gunsnprices`](https://www.npmjs.com/package/gunsnprices) parser 0.1.2.
