# Biloo Rider avatars

The collection uses generated 3D character artwork, with one account-scoped picker and one renderer shared by the preview and map. Driver vehicle markers and profile photos are separate.

- Source: `assets/rider-avatars/collection-v2.png`, generated with the built-in image-generation tool.
- Production assets: `public/avatars/rider/character-01-v2.webp` through `character-20-v2.webp`.
- Repackage: `node scripts/package-rider-avatar-atlas.mjs`.
- Map: fixed 36 × 48 CSS-pixel box; artwork 29 × 48; bottom anchor at the GPS coordinate; 20 × 6 location halo without an expanding animation. Zoom and device pixel ratio do not enlarge the avatar.
- Picker: 20 looks, skin/hair/outfit colors, a larger portrait and a true-size map sample. Scoped SVG color masks retain material highlights and shadows.
- Persistence: the existing `rider_map_avatars.design` row where provisioned. If that table is missing (`PGRST205`/`42P01`), use the authenticated user's `biloo_rider_map_avatar` cosmetic metadata instead. Other database errors remain errors. Cache and map events update only after a confirmed save. These preferences never determine access or roles.

## Live motion and pickup coordination

- Own-device poses use `lib/biloo-rider-motion.ts`: reliable device pedestrian speed, or displacement exceeding GPS accuracy, selects walking/jogging. Stationary fixes, stale or inaccurate readings, out-of-order updates and vehicle speeds remain idle. A missing fix stops locomotion after six seconds. Driver approach never makes a stationary rider walk.
- The Mapbox box stays 36 × 48 CSS pixels, bottom anchored at the real device coordinate. Only the character's legs or palm move. Idle breathing is restrained. Paused/stale location, hidden pages, reduced motion and Biloo data saver suppress motion. Driver car dimensions are unchanged.
- Arrival raises the hand briefly, once per trip. An authenticated “I'm here” button sends the existing human-readable private chat message `I'm here at pickup. 👋`. The interface reports success only after a confirmed response; retries reuse a nonce, and rapid taps reuse the recent signal.
- `/api/trips/[tripId]/pickup-signal` verifies the session, current rider/driver assignment and pre-trip stage on every read or send. Chat RLS and database-generated sender/timestamps remain authoritative. The assigned driver receives only normalized cosmetic avatar fields and a signal ID/timestamp. Signals expire after 90 seconds, including while offline. No new location sharing, schema, role, trip-state or payment mutation is introduced.
- On Driver navigation the avatar marks the **booked pickup point**, not a claimed live rider location. A signal refreshes through the existing RLS-protected chat publication, with foreground polling/reconnection recovery. The text also appears in ordinary trip chat.
- Once the trip starts, the person marker and pickup control disappear. The existing assigned vehicle marker continues to show the driver's actual tracked location.
- Active-trip camera framing measures the actual header, destination card, map controls and sheet. It keeps the full person clear during initial fitting, resizing and recentering, and preserves manual panning. A short exposed map hides the duplicate destination card; the destination remains in the trip sheet. Card colors follow the current day/night tokens. Pickup controls use the shared SVG hand/check icons so their appearance does not depend on emoji fonts, and confirmed-send text keeps full contrast.

### Pickup artwork

The built-in image-generation tool edited the original collection into an identity-matched waving pose atlas: `assets/rider-avatars/collection-wave-v1.png`. Optimized outputs are `public/avatars/rider/character-01-wave-v1.webp` through `character-20-wave-v1.webp`. Repackage with:

```sh
node scripts/package-rider-avatar-atlas.mjs assets/rider-avatars/collection-wave-v1.png wave
```

Prompt: preserve all twenty adult identities, hairstyles/head coverings, clothing, body proportions, 3D lighting, reading order and four-column/five-row grid from the original atlas; change one arm into a natural bent-elbow taxi-hailing wave, open palm beside the head and separated from the hair, full figures head to shoes on consistent baselines, genuine transparent background, no scenery, floor, labels, logos, text or objects. The generated collection consistently raises the arm on the screen's right. The renderer gently turns that palm and keeps the body still.

Verification: unit cases exercise GPS uncertainty/speed and private API ownership, assignment, stages, projection, nonce retry, expiry and failure. Browser fixtures exercise actual Mapbox DOM markers, all 20 textures, mobile/desktop, reduced motion/data saver, arrival, confirmed/failed sends across separate rider/driver contexts, day/night and boarding. Browser backend responses are simulated; these checks do not claim a real authenticated production ride was performed.

## Artwork prompt

Create a single transparent sprite atlas with exactly 20 premium realistic 3D adult human characters in a regular four-column, five-row grid. Full-body standing figures, head to shoes, consistent scale and studio lighting. Natural Ethiopian/East African faces, varied rich brown complexions, adult ages 22–55, friendly restrained smiles, detailed hair, physically based skin and fabric materials. Modern navy and blue smart-casual clothing, charcoal trousers or jeans, cream sneakers. No logos, labels, numbers, backgrounds, frames, objects or platforms. Each character stays inside its own cell with clear padding. Avoid flat vector artwork, low-poly bodies, plastic dolls, oversized cartoon heads and childlike proportions.

Reading order: curly-haired man in a bomber; woman with long braids; man with textured fade; woman with natural afro; bearded man in blazer; woman in hijab and long coat; man with tied locs; woman with shoulder-length curls; man with glasses; woman with sleek bob; mature man with salt-and-pepper hair; woman with braided bun; man with loose curls and hoodie; woman with twist-out curls; man with close fade and polo; woman in headwrap; man with wavy side-part hair; woman with long waves; mature man with grey temples; mature woman with short natural curls. Maintain equal detail and quality across all 20.
