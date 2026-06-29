## Goal
Modernize ONLY the visual and camera UX of the Passenger map. Zero changes to business logic (rides, dispatch, auth, Supabase, payments, notifications, admin).

## Scope of files touched
- `src/lib/googleMaps.ts` — add `MOVVI_LIGHT_MAP_STYLE` and export both light + dark styles; add a helper `getMapStyleForTheme(resolved)`.
- `src/components/MovviMap.tsx` — react to current theme from `useTheme()`, swap map style live, keep stable `mapKey`, expose `onDragStart`/`onDragEnd` and optional `pickMode` (center pin).
- `src/routes/passageiro.app.tsx` — only the presentational layer:
  - New floating top search card (Pickup + Destination), rounded, shadow.
  - New horizontal category carousel cards (icon, name, price, ETA).
  - Payment row (PIX / Credit / Cash) + Coupon + Schedule buttons (UI only — wire to existing handlers when present, otherwise no-op toast "Em breve").
  - Big primary "Solicitar corrida" button always visible.
  - Replace driver/origin/destination marker icons with branded SVGs (green pickup, red destination, animated car for driver).
  - Polyline: MOVVI green, thicker, with white outline (render two polylines).
  - Camera controller: single source of truth, no repeated `fitBounds`/`setCenter`; only re-fits on (a) recenter button, (b) destination change, (c) ride status transition; smooth `panTo` follow during active ride with throttle + dead zone (mirroring the driver app fix).
  - Drag-to-pick: when user drags map in pickup-selection mode, show fixed center pin; on `dragend`, reverse-geocode and update pickup via the EXISTING handler (no new business rules).
- `src/lib/theme.tsx` — already has Light/Dark/System; verify Settings already calls `setMode`. No logic change.

## Explicitly NOT changing
- `rideLifecycle.ts`, `routes.functions.ts`, `geocode.functions.ts`, dispatch, tariffs, fare math, Supabase queries, realtime, push, admin, driver app.
- Any function signatures the page already calls.

## Camera rules (final)
- Stable initial center memoized from first valid GPS.
- `panTo` throttled at 1500ms, dead zone 15m, disabled when user drags; re-armed by recenter button.
- `fitBounds` runs once per (rideId, status) tuple via a ref guard.

## Marker assets
- Pickup: green circle with MOVVI "M" (SVG via dataURL).
- Destination: red pin (SVG).
- Driver car: rotating car SVG (rotation = bearing from previous position).

## Theme reactivity for the map
- `MovviMap` reads `useTheme().resolved`; passes the corresponding style array to `<GoogleMap options>`. The `mapKey` includes resolved theme so Google Maps re-applies styles cleanly on toggle.

## Validation
- Typecheck via existing tooling.
- Manual visual check via Playwright on `/passageiro/app` (light + dark), confirming map render, marker placement, no console errors, and that toggling theme in Settings updates the map.

## Out of scope (will not implement now unless asked)
- Real PIX/credit/cash processing.
- Schedule ride backend.
- Coupon backend (UI button only).