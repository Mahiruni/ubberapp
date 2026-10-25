# Biloo Driver map cars

Drivers choose their map car under **Profile → Map car avatar**, or **Vehicle management**. The studio previews Signature, Goldline and Executive finishes using the registered model, paint color and body type. The same appearance is sent to Riders and private trip-link viewers.

## Vehicle identity and preferences

- Registered model and paint come from `drivers.vehicle` and `drivers.vehicle_color` on the server. The avatar picker accepts only an allowlisted `style`; it cannot change these fields, the plate, ride category, seats, eligibility or review status.
- Onboarding and verification capture `vehicle_body_type` in account presentation metadata, alongside the model it describes. Existing registrations use a model-based body default. A declared body applies only while the model matches; a replacement car never inherits an unrelated old body shape.
- A Driver can review a body default through the existing vehicle verification form. These four shapes are Sedan, Hatchback, SUV and Van / MPV. They illustrate the registered body class rather than promising an exact manufacturer mesh.
- The cosmetic style is saved to Supabase Auth user metadata as `biloo_driver_map_avatar: { style }`. This uses the existing account service, works across devices and requires no database migration. Auth metadata is never an authorization source.
- `GET /api/driver/map-avatar` loads the current registered appearance. `PATCH` authenticates an active Driver, validates a style-only payload and saves only that Driver's preference. Failed saves leave the current map style intact. An incomplete model or color prevents customization.

## Map rendering

`lib/biloo-driver-map-avatar.ts` contains original, parameterized vector artwork with raised body shading, metallic paint, reflective glass, tires, lights and Biloo roof/sill branding. It supports 4 shapes × 12 registered colors × 3 finishes without shipping a large image atlas. The neutral default is used only when paint is unknown.

The public `/brand/driver-avatar` image endpoint accepts only allowlisted enums. It contains no identity, coordinates, user text, scripts or external assets. Shared marker CSS is used both by React maps and the embedded Leaflet screens. The map anchor remains at the verified coordinate; heading rotates the image inside the anchor, compensating for Mapbox bearing where applicable. Missing heading stays neutral. Stale GPS dims the car rather than inventing movement.

Coverage: Driver home, Driver map, Driver navigation, nearby Rider supply, the assigned Rider trip, embedded pickup/on-trip maps and private shared-trip maps. Nearby supply retains anonymous per-viewer keys; private share links expose only body/color/style. All existing range, eligibility, trip ownership, GPS freshness, share expiry and revocation rules remain in place. Optional metadata reads use a bounded 10-second appearance-only cache; Rider nearby polling picks up a changed finish without moving or duplicating a stationary car.

Driver navigation measures the actual trip sheet/guidance bounds when framing the map so the taller car remains above mobile controls or beside the desktop panel. Panning still respects the driver's manual camera choice; recenter restores unobstructed framing.

## Verification

Unit coverage validates all 144 paint/body/finish combinations, legacy model defaults, registration binding, style-only writes, ownership/role restrictions, failed saves, anonymous nearby supply and private-link expiry. Browser fixtures verify the actual SVG images, reload persistence, keyboard navigation, light/dark contrast, narrow layouts, Driver/Rider synchronization, stationary-car refresh, private links and embedded Leaflet anchoring. Map fixtures use a local test token and synthetic provider styles; no live GPS or real Driver identity is created by tests.
