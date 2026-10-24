# Biloo Rider avatars

The collection uses generated 3D character artwork, with one account-scoped picker and one renderer shared by the preview and map. Driver vehicle markers and profile photos are separate.

- Source: `assets/rider-avatars/collection-v2.png`, generated with the built-in image-generation tool.
- Production assets: `public/avatars/rider/character-01-v2.webp` through `character-20-v2.webp`.
- Repackage: `node scripts/package-rider-avatar-atlas.mjs`.
- Map: fixed 36 × 48 CSS-pixel box; artwork 29 × 48; bottom anchor at the GPS coordinate; 20 × 6 location halo without an expanding animation. Zoom and device pixel ratio do not enlarge the avatar.
- Picker: 20 looks, skin/hair/outfit colors, a larger portrait and a true-size map sample. Scoped SVG color masks retain material highlights and shadows.
- Persistence: the existing `rider_map_avatars.design` row where provisioned. If that table is missing (`PGRST205`/`42P01`), use the authenticated user's `biloo_rider_map_avatar` cosmetic metadata instead. Other database errors remain errors. Cache and map events update only after a confirmed save. These preferences never determine access or roles.

## Artwork prompt

Create a single transparent sprite atlas with exactly 20 premium realistic 3D adult human characters in a regular four-column, five-row grid. Full-body standing figures, head to shoes, consistent scale and studio lighting. Natural Ethiopian/East African faces, varied rich brown complexions, adult ages 22–55, friendly restrained smiles, detailed hair, physically based skin and fabric materials. Modern navy and blue smart-casual clothing, charcoal trousers or jeans, cream sneakers. No logos, labels, numbers, backgrounds, frames, objects or platforms. Each character stays inside its own cell with clear padding. Avoid flat vector artwork, low-poly bodies, plastic dolls, oversized cartoon heads and childlike proportions.

Reading order: curly-haired man in a bomber; woman with long braids; man with textured fade; woman with natural afro; bearded man in blazer; woman in hijab and long coat; man with tied locs; woman with shoulder-length curls; man with glasses; woman with sleek bob; mature man with salt-and-pepper hair; woman with braided bun; man with loose curls and hoodie; woman with twist-out curls; man with close fade and polo; woman in headwrap; man with wavy side-part hair; woman with long waves; mature man with grey temples; mature woman with short natural curls. Maintain equal detail and quality across all 20.
