# Plano — Pickup Label Inteligente (Production v2)

## 1. Núcleo: `buildPickupLabel` em `src/lib/geocode.functions.ts`

Reescrever a função de rótulo no servidor para seguir a cadeia de prioridades:

1. Rua nomeada + número (ignorar "Unnamed Road")
2. Bairro (`neighborhood`)
3. Distrito (`administrative_area_level_4` / `sublocality_level_1`)
4. Povoado / Comunidade (heurística: `sublocality_level_2`, `political`; prefixar "Povoado" ou "Comunidade")
5. Zona Rural (quando rural + sem rua)
6. POI próximo (Places `searchNearby`, raio 300 m → "Próximo à …")
7. Rodovia: detectar via tipo `route` cujo `short_name` casa `^(BR|PR|SP|MG|RS|RJ|PI|PE|BA|...)-?\d+` → "BR-316 km 87" (km calculado por snap-to-roads quando viável; fallback sem km)
8. Município (`locality, UF`)
9. Coordenadas (último recurso)

Adicionar:
- `pickupShortLabel`: primeiro token relevante (rua sem número, bairro, povoado sem prefixo, "Centro", nome do POI, "BR-316").
- `pickupSource`: `"gps" | "manual" | "places"` (default `"gps"`).
- `pickupPlaceId?` quando vier de Places.
- Expandir `fetchNearestPoi` raio 200 → 300 m; manter filtro de tipos genéricos.

Retornar campos novos no `GeocodeResult`: `pickupShortLabel`, `pickupSource`, `pickupPlaceId`.

## 2. Persistência na corrida

Migration: adicionar colunas em `public.rides`:
- `pickup_label text`
- `pickup_short_label text`
- `pickup_address text` (formatted_address)
- `pickup_place_id text`
- `pickup_source text` (`gps|manual|places`)

(Já existem `pickup_lat/lng` — reutilizar como `pickupCoordinates`.)

Atualizar `criarCorrida` em `src/lib/rideLifecycle.ts` para aceitar/gravar esses campos. Atualizar tipos do form em `passageiro.app.tsx` para enviar.

## 3. Passageiro (`src/routes/passageiro.app.tsx`)

- Substituir cálculo local de `pickupAddressLine`/`pickupSubLine` por consumo direto de `geo.pickupLabel`/`geo.pickupShortLabel`.
- Enviar `pickup_label`, `pickup_short_label`, `pickup_address`, `pickup_place_id`, `pickup_source` ao criar corrida.
- Cache local: `localStorage["movvi.lastPickupLabel"]` = `{ label, short, lat, lng, ts }`. Quando geocoding falhar e GPS válido < 200 m do cache, reusar o label cacheado (nunca degradar para coordenadas).
- Botão "Ajustar partida": novo modo `pinAdjustMode` — pin fixo no centro da viewport, mapa arrastável, ao confirmar chama `reverseGeocode` no centro atual, marca `pickupSource = "manual"`, atualiza estado, toast "Ponto de partida confirmado.".
- Marker do passageiro com label "Sua localização".

## 4. Motorista (`src/routes/motorista.app.tsx` + detalhes)

- Card de oferta usa `ride.pickup_short_label || pickup_label || endereço`.
- Tela de detalhes mostra `pickup_label` (linha 1) + sub (município) e distância motorista→pickup (já existe Haversine).
- Marker do passageiro no mapa: InfoWindow com `pickup_short_label`.
- Tela de rota: origem = `pickup_short_label`, destino = primeira parte de `destination_address`.

## 5. Não-regressões

Manter intactos: GPS watcher, Routes API, Places autocomplete, dispatch, tracking, histórico, painel admin. Não tocar em RLS, auth ou tabelas existentes além das colunas novas.

## 6. Validação

Smoke-test build + tsgo. Cenários cobertos via lógica determinística do `buildPickupLabel` (sem necessidade de testes de integração novos neste turno).

---

## Detalhes técnicos

**Arquivos editados:**
- `src/lib/geocode.functions.ts` — nova `buildPickupLabel`, short label, source, place_id, raio 300 m, detecção rodovia.
- `src/lib/rideLifecycle.ts` — gravar novos campos na criação.
- `src/routes/passageiro.app.tsx` — consumir label, enviar à corrida, cache, modo ajuste de pin, marker.
- `src/routes/motorista.app.tsx` — usar short label em card/marker/rota.
- (se houver) `src/routes/motorista.corridas.$id.tsx` — exibir pickup_label.

**Migration:** adicionar 5 colunas em `rides` (todas nullable, sem default).

**Sem mudanças** em: tipos auto-gerados (regenerados), client.ts, auth-middleware.
