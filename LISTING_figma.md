# Figma Community listing: Gun & Ammo Data

Status: **not submitted**. Everything below is prepared text; publishing happens from the Figma desktop app
(Plugins → Development → Gun & Ammo Data → Publish).

## Fields

**Name:** Gun & Ammo Data

**Tagline:** Real firearm models, calibers, prices and ammo boxes for your mockups. Works offline.

**Description:**

> Fill mockups for gun stores, ammo shops, shooting ranges and price comparison apps with real data instead of
> "Product name" and "$00.00".
>
> Name text layers in a card #title, #brand, #model, #caliber, #price, #from, #capacity, #barrel, #rounds, #cpr
> (cost per round) or #specs, select one card or a whole grid, and click Fill selection. Every card gets a different
> gun or ammo box, and all layers of a card come from the same one, so the caliber and the price match the title.
>
> • Handguns, rifles, shotguns and ammo: 2,105 firearm models from 49 brands and 736 ammo boxes in 85 calibers
> • Real store-style titles: Glock 19 Gen 5 9mm 4.02" 15rd Pistol, Browning A5 12 Gauge 26" 4+1 Shotgun,
>   CCI Blazer .22LR 40gr LRN Ammunition, 425rds
> • Real US prices (in-stock, October 2026 snapshot), cost per round for ammo
> • Filter by brand and caliber, popular first or random
> • Finds lists and grids of cards on its own; leaves buttons and labels alone
> • "Create 3 sample cards" to see how it works
> • Second command, Normalize caliber text: 9MM LUGER → 9×19mm Parabellum, 12ga → 12 Gauge, 300 BLK → .300 AAC Blackout
> • FigJam: fills stickies and shapes too
>
> No network access, no account, no tracking. The data ships inside the plugin.
>
> Data: GunsNPrices (gunsnprices.com), CC BY 4.0. The plugin is open source (MIT).

**Category:** the content/data or "Design tools" category, whichever the publish dialog offers (the help page lists
categories only as examples).

**Tags** (the help page gives no limit; enter the first ones if the dialog caps them): `mock data`,
`placeholder`, `ecommerce`, `product card`, `firearms`, `guns`, `ammo`, `caliber`, `price`, `content`.

**Support contact:** app@gunsnprices.com (also https://github.com/gunsnprices/figma-gunsnprices/issues once the repo is
public).

**Icon:** `assets/icon-128.png` (128 × 128, from `brand/gunsnprices-icon-512.png`).

**Thumbnail / cover:** `assets/cover-1920x1080.png` (1920 × 1080). The cards on it show exactly what the plugin writes
for the first row of each category, and they are labeled "DESIGN MOCK". Regenerate with `npm run assets`.

**Carousel (optional, up to 9):** none prepared. Good candidates: a before/after of a 3 × 2 product grid, and the
panel (screenshot it in Figma after importing).

**Playground file (optional):** a Figma file with one tagged card and an empty 3 × 2 grid of its instances, so that
reviewers and users can click Fill selection right away. The "Create 3 sample cards" button builds the card.

**Data security disclosure (optional form):** suggested answers.

| Question | Answer |
|---|---|
| Does the plugin have a backend / hosted service? | No |
| Network requests to services you don't host? | No. The manifest sets `"allowedDomains": ["none"]`; the listing will show "No access to network" |
| User authentication? | No |
| Does it store data derived from Figma files? | No. It saves only the panel settings (category, filters, order) with `figma.clientStorage`, on the user's computer |
| How are updates managed? | New versions are published from the open source repository through Figma's publish flow |

**Privacy policy:** not required by the guidelines for a plugin that doesn't process user data. If the dialog asks for
one, use https://gunsnprices.com's privacy page and mention that the plugin itself collects nothing.

## Requirements found (read on 2026-11-10)

- Publishing: only from the desktop app; the account needs **two-factor authentication**; you choose to publish as
  yourself, a team or an organization. https://help.figma.com/hc/en-us/articles/360042293394
- Listing: name, tagline, description, category, icon (recommended 128 × 128), thumbnail image or video
  (recommended 1920 × 1080), up to nine carousel images/videos (optional), playground file (optional), support contact,
  security disclosure form (optional). Review "may take up to two weeks"; a Figma staff member wrote in March 2026 that
  they aim for 5–10 business days (https://forum.figma.com/ask-the-community-7/plugin-review-taking-20-days-is-this-normal-52367).
  Same page as above.
- Security disclosure form: voluntary. https://help.figma.com/hc/en-us/articles/16354660649495
- Review guidelines: a way for users to contact you for support; a privacy policy if the plugin processes user data;
  no ads; no duplicate listings. https://help.figma.com/hc/en-us/articles/360039958914
- Naming: no "Figma" or "Fig" in the product name ("Gun & Ammo Data" is fine; "a plugin for Figma" in text is the
  allowed form). https://www.figma.com/using-the-figma-brand/
- Manifest: `documentAccess: "dynamic-page"` is required for new plugins; `networkAccess` with `["none"]`;
  `editorType` `figma` + `figjam`; the `id` is assigned by Figma ("Create new plugin", or at publish time).
  https://developers.figma.com/docs/plugins/manifest/
- Acceptable Use Policy (updated 2026-10-07): no clause on firearms or ammunition; section 3(e) bars content that
  "promotes illegal or harmful activities, goods, or substances". https://www.figma.com/legal/aup/
- Not documented anywhere I could find: limits on name, tagline and tag counts; the full category list; whether the
  Community profile has a website field (set it in the profile editor if offered).

## Before publishing

1. `npm ci && npm test` (builds `dist/`).
2. Figma desktop → Plugins → Development → Import plugin from manifest → `manifest.json`. Run both commands in a
   Figma Design file and in a FigJam board.
3. Publish. Figma assigns the plugin ID; put it into `manifest.json` (`"id"`, now the placeholder
   `gunsnprices-gun-ammo-data`), commit, and keep it for every update.
