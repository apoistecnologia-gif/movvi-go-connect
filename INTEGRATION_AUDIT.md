# MOVVI DRIVE — Integration Audit (Admin ↔ Driver ↔ Passenger)

Date: 2026-06-28
Scope: verify Supabase is the single source of truth; no mocks; realtime sync.

Legend: ✅ Fully integrated · ⚠️ Partial · ❌ Not integrated · 🧪 Mock/local only

| # | Area | Status | Notes |
|---|---|---|---|
| 1 | Driver approval (admin → driver) | ⚠️→✅ | `drivers.approval_status` is checked on driver-app load (`loadDriverProfile`). **Fix applied:** driver app now subscribes to `drivers` self-row realtime and forces offline + UI block on `bloqueado`/`reprovado` without reload. |
| 2 | Driver documents | ✅ | `driver_documents` shared by `/motorista/status`, `/admin/motoristas` detail. Realtime channel `driver-status-self` already in place. |
| 3 | Driver subscription | ❌→✅ | Driver app did **not** consult `drivers.subscription_status`. **Fix applied:** going online is blocked when `subscription_status` is `vencida`/`pendente`/`suspensa`; banner + toast explain. Realtime listener forces offline if admin suspends mid-session. |
| 4 | Driver earnings | ✅ | `motorista.ganhos` uses RPC `get_driver_stats` over real `rides`; no mock arrays. |
| 5 | Ride history | ✅ | Both apps and admin read from `public.rides`. Status enum unified via `rideLifecycle`. |
| 6 | Fare management | ✅ | `useTariffs` reads `tariff_rules` with realtime; passenger estimate uses it. Server functions recompute price authoritatively (`client_submitted_prices` hardened). Driver displays `rides.estimated_price` / `final_price` from DB. |
| 7 | Categories | ✅ | `UiCategoriesProvider` reads `ride_categories` with realtime; disabled ones disappear from grid for passengers. |
| 8 | Notifications (admin → apps) | ❌→✅ | Admin broadcast was inserted into `public.notifications`, but driver/passenger apps read `public.notification_inbox`. **Fix applied:** admin now writes to `notification_inbox` (with `category='admin'`) and keeps `notifications_broadcast` for audit. |
| 9 | Promotions / coupons | ⚠️ | `coupons` CRUD exists in admin. Passenger app has **no** UI to apply codes yet — documented as gap; not in this fix pass (feature work). Validation logic would live server-side at price computation. |
| 10 | SOS | ✅ | Passenger writes to `sos_alerts` with `ride_id`, lat/lng, message; admin `/admin/seguranca` lists them. Driver SOS uses same table. |
| 11 | Block / suspension | ❌→✅ | Passenger app did **not** check `users.blocked_at` / `suspended_at`. **Fix applied:** on mount, app blocks UI with explanation and forces logout. Driver block already handled by approval gate + new realtime block listener. |
| 12 | Platform settings | ⚠️ | `useAppSettings` is wired (realtime on `app_settings`). Used by: terms/privacy URL fallback. Other consumers (timeout, radius, GPS required, payment methods) still hardcoded or local. Documented; not part of this fix pass to avoid scope drift. |
| 13 | Preferences | ✅ | Driver: `driver_preferences` table + `driverPrefs.ts` cache. Passenger: `users.preferences` JSONB + theme provider. Survives logout/login. |

## Critical fixes applied this pass

1. **Admin notifications reach apps** — `src/routes/admin.notificacoes.tsx` now inserts into `notification_inbox`.
2. **Driver subscription + block enforced in realtime** — `src/routes/motorista.app.tsx` subscribes to its own `drivers` row, forces offline on suspension/block, blocks online toggle when subscription is not active.
3. **Passenger block enforced** — `src/routes/passageiro.app.tsx` checks `users.blocked_at/suspended_at` on mount and on realtime change; shows explanation and signs out.

## Known follow-ups (not fixed in this pass — feature work)

- Coupon redemption UI in passenger checkout (table is ready; needs server-side discount in `rideLifecycle`).
- Wider `app_settings` adoption (request timeout, search radius arrays, payment toggles) across both apps.
- Driver app accept/dismiss policy filtered by `driver_preferences.accept_short/long/max_radius_km` server-side.
