import { supabase } from "@/integrations/supabase/client";

export type FavoriteKind = "home" | "work" | "custom";

export interface FavoritePlace {
  id: string;
  user_id: string;
  label: string;
  kind: FavoriteKind;
  address: string;
  lat: number;
  lng: number;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RecentPlace {
  id: string;
  user_id: string;
  address: string;
  lat: number;
  lng: number;
  place_id: string | null;
  use_count: number;
  last_used_at: string;
  created_at: string;
}

export interface NewFavorite {
  label: string;
  kind: FavoriteKind;
  address: string;
  lat: number;
  lng: number;
  icon?: string | null;
}

type PlaceCache = {
  favorites: FavoritePlace[];
  recents: RecentPlace[];
};

const CACHE_PREFIX = "apois:legacy-passenger:places:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LABEL = 80;
const MAX_ADDRESS = 300;
const MAX_ICON = 80;
const MAX_PLACE_ID = 200;

function clean(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function validCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function validKind(value: unknown): value is FavoriteKind {
  return value === "home" || value === "work" || value === "custom";
}

function safeDate(value: unknown): string {
  const text = clean(value, 64);
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date(0).toISOString();
}

async function uid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error("Sua sessão expirou. Entre novamente.");
  return data.user.id;
}

function cacheKey(userId: string) {
  const normalized = userId.trim();
  if (!UUID_RE.test(normalized)) throw new Error("Usuário inválido para preferências locais.");
  return `${CACHE_PREFIX}${normalized}`;
}

function normalizeFavorite(value: unknown, userId: string): FavoritePlace | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<FavoritePlace>;
  const id = clean(row.id, 100);
  const label = clean(row.label, MAX_LABEL);
  const address = clean(row.address, MAX_ADDRESS);
  if (!id || !label || !address || !validKind(row.kind) || !validCoordinate(row.lat, row.lng)) return null;
  const order = Number(row.sort_order);
  return {
    id,
    user_id: userId,
    label,
    kind: row.kind,
    address,
    lat: row.lat,
    lng: row.lng,
    icon: clean(row.icon, MAX_ICON) || null,
    sort_order: Number.isInteger(order) && order >= 0 ? Math.min(order, 9999) : 0,
    created_at: safeDate(row.created_at),
    updated_at: safeDate(row.updated_at),
  };
}

function normalizeRecent(value: unknown, userId: string): RecentPlace | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<RecentPlace>;
  const id = clean(row.id, 100);
  const address = clean(row.address, MAX_ADDRESS);
  if (!id || !address || !validCoordinate(row.lat, row.lng)) return null;
  const useCount = Number(row.use_count);
  return {
    id,
    user_id: userId,
    address,
    lat: row.lat,
    lng: row.lng,
    place_id: clean(row.place_id, MAX_PLACE_ID) || null,
    use_count: Number.isInteger(useCount) && useCount > 0 ? Math.min(useCount, 1_000_000) : 1,
    last_used_at: safeDate(row.last_used_at),
    created_at: safeDate(row.created_at),
  };
}

function readCache(userId: string): PlaceCache {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return { favorites: [], recents: [] };
    const parsed = JSON.parse(raw) as Partial<PlaceCache>;
    const favorites = Array.isArray(parsed.favorites)
      ? parsed.favorites.map((item) => normalizeFavorite(item, userId)).filter((item): item is FavoritePlace => Boolean(item)).slice(0, 100)
      : [];
    const recents = Array.isArray(parsed.recents)
      ? parsed.recents.map((item) => normalizeRecent(item, userId)).filter((item): item is RecentPlace => Boolean(item)).slice(0, 20)
      : [];
    return { favorites, recents };
  } catch {
    return { favorites: [], recents: [] };
  }
}

function writeCache(userId: string, cache: PlaceCache) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(cache));
  } catch {
    throw new Error("Não foi possível salvar este local neste dispositivo.");
  }
}

function newId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeInput(fav: NewFavorite) {
  const label = clean(fav.label, MAX_LABEL);
  const address = clean(fav.address, MAX_ADDRESS);
  if (!label) throw new Error("Informe um nome para o local favorito.");
  if (!address) throw new Error("Informe um endereço válido.");
  if (!validKind(fav.kind)) throw new Error("Tipo de local favorito inválido.");
  if (!validCoordinate(fav.lat, fav.lng)) throw new Error("Coordenadas do local inválidas.");
  return {
    label,
    kind: fav.kind,
    address,
    lat: fav.lat,
    lng: fav.lng,
    icon: clean(fav.icon, MAX_ICON) || null,
  };
}

/**
 * Compatibilidade para a superfície Passageiro legada deste repositório.
 * `favorite_places` e `recent_places` não existem no schema oficial da APOIS
 * Corridas; estes dados permanecem somente no dispositivo, isolados por usuário.
 */
export async function listFavorites(): Promise<FavoritePlace[]> {
  const userId = await uid();
  return [...readCache(userId).favorites].sort((a, b) =>
    a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at),
  );
}

export async function createFavorite(fav: NewFavorite): Promise<FavoritePlace> {
  const userId = await uid();
  const cache = readCache(userId);
  if (cache.favorites.length >= 100) throw new Error("Limite de locais favoritos atingido neste dispositivo.");
  const input = normalizeInput(fav);
  const now = new Date().toISOString();
  const created: FavoritePlace = {
    id: newId(),
    user_id: userId,
    ...input,
    sort_order: cache.favorites.length,
    created_at: now,
    updated_at: now,
  };
  cache.favorites.push(created);
  writeCache(userId, cache);
  return created;
}

export async function updateFavorite(id: string, patch: Partial<NewFavorite>): Promise<void> {
  const userId = await uid();
  const cache = readCache(userId);
  const safeId = clean(id, 100);
  const index = cache.favorites.findIndex((item) => item.id === safeId);
  if (index < 0) return;
  const current = cache.favorites[index];
  const input = normalizeInput({
    label: patch.label ?? current.label,
    kind: patch.kind ?? current.kind,
    address: patch.address ?? current.address,
    lat: patch.lat ?? current.lat,
    lng: patch.lng ?? current.lng,
    icon: patch.icon === undefined ? current.icon : patch.icon,
  });
  cache.favorites[index] = { ...current, ...input, updated_at: new Date().toISOString() };
  writeCache(userId, cache);
}

export async function deleteFavorite(id: string): Promise<void> {
  const userId = await uid();
  const cache = readCache(userId);
  const safeId = clean(id, 100);
  cache.favorites = cache.favorites.filter((item) => item.id !== safeId).map((item, index) => ({ ...item, sort_order: index }));
  writeCache(userId, cache);
}

export async function listRecentPlaces(limit = 8): Promise<RecentPlace[]> {
  const userId = await uid();
  const safeLimit = Number.isFinite(limit) ? Math.min(20, Math.max(0, Math.floor(limit))) : 8;
  return [...readCache(userId).recents]
    .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
    .slice(0, safeLimit);
}

export async function registerRecentPlace(input: {
  address: string;
  lat: number;
  lng: number;
  place_id?: string | null;
}): Promise<void> {
  const userId = await uid();
  const address = clean(input.address, MAX_ADDRESS);
  if (!address || !validCoordinate(input.lat, input.lng)) return;
  const placeId = clean(input.place_id, MAX_PLACE_ID) || null;
  const cache = readCache(userId);
  const now = new Date().toISOString();
  const existing = cache.recents.find((item) => item.place_id === placeId && placeId !== null) ?? cache.recents.find((item) => item.address.toLocaleLowerCase("pt-BR") === address.toLocaleLowerCase("pt-BR"));
  if (existing) {
    existing.address = address;
    existing.lat = input.lat;
    existing.lng = input.lng;
    existing.place_id = placeId ?? existing.place_id;
    existing.use_count = Math.min(1_000_000, existing.use_count + 1);
    existing.last_used_at = now;
  } else {
    cache.recents.push({
      id: newId(),
      user_id: userId,
      address,
      lat: input.lat,
      lng: input.lng,
      place_id: placeId,
      use_count: 1,
      last_used_at: now,
      created_at: now,
    });
  }
  cache.recents = cache.recents
    .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
    .slice(0, 20);
  writeCache(userId, cache);
}

export async function deleteRecentPlace(id: string): Promise<void> {
  const userId = await uid();
  const cache = readCache(userId);
  const safeId = clean(id, 100);
  cache.recents = cache.recents.filter((item) => item.id !== safeId);
  writeCache(userId, cache);
}
