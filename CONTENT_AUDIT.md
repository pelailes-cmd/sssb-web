# Smart Save Solar content audit

## Supplied inventory

- Logo: 1 transparent PNG supplied for the official standalone mark (`447 × 447`)
- Cover: 1 PNG branding reference (`3362 × 1246`)
- Products: 15 JPG source images (14 at `2048 × 2048`, 1 at `1254 × 1254`)
- Promotions: 1 JPG source image (`1254 × 1254`)
- 3D models: 37 GLB files (`7.17 MB` total), including individual, grouped, and collection scenes
- Documents/datasheets: none supplied
- Portfolio/project photography: none supplied
- Existing application/configuration: none; the project was asset-only before implementation

All files in `Cover`, `logo`, `Products`, `Promotions`, and `models` remain unchanged. Optimized image crops and build-ready model copies are generated separately in `public/assets` by `scripts/process-assets.mjs`.

## Verified business information

- Business name: Smart Save Solar (the supplied artwork reads "Smart Save Solar Bicol"; the
  location descriptor was removed from the website branding on request, since the company now
  serves more than one service area)
- Supporting name shown in supplied artwork: Smart Save Ventures Corp.
- Tagline: Solar you can Trust! (website display follows the requested title case: “Solar You Can Trust”)
- Phone: 0997-688-4865
- Address: Zone 1, Caroyroyan, Pili, Camarines Sur
- Services printed on the cover: Residential Solar Systems; Commercial Solar Solutions; Industrial Solar Projects; After-Sales Support & Maintenance

## Promotion extraction

- Title: FREE AIRCON PROMO!
- Supporting line: GO SOLAR AND STAY COOL!
- 6KWP up to 10KWP solar installation: FREE 1 HP WINDOW TYPE AIRCON
- 11KWP AND UP solar installation: FREE 1 HP SPLIT TYPE AIRCON
- Condition: *PROMO IS UNTIL SUPPLIES LAST
- No calendar validity date is printed. The website status is therefore `unverified`, displayed as “Confirm availability,” and can be changed in `src/data/siteData.ts`.

## Uncertain content

- Two product posters print the email as `ssvc..bicol@gmail.com`. The consecutive periods appear invalid for a Gmail address. It is retained in this audit but intentionally omitted from live links until the official spelling is confirmed.
- The Smart Save Solar hybrid inverter poster shows `40,050` for 6KW and `63,000` for 10KW but prints no currency symbol. The site preserves the values and explicitly notes that the source did not state a currency.
- No product warranty durations are printed in the supplied images. No durations are stated on the website.
- No promotion availability date, portfolio project facts, client names, performance results, certificates, or datasheet files were supplied.
- A production domain was not supplied, so `robots.txt` is ready but no absolute sitemap URL or canonical URL is fabricated.
