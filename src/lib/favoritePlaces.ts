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

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Não autenticado");
  return data.user.id;
}

function cacheKey(userId: string) {
  return `${CACHE_PREFIX}${userId}`;
}

function readCache(userId: string): PlaceCache {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return { favorites: [], recents: [] };
    const parsed = JSON.parse(raw) as Partial<PlaceCache>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      recents: Array.isArray(parsed.recents) ? parsed.recents : [],
    };
  } catch {
    return { favorites: [], recents: [] };
  }
}

function writeCache(userId: string, cache: PlaceCache) {
  localStorage.setItem(cacheKey(userId), JSON.stringify(cache));
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Compatibilidade para a superfície Passageiro legada deste repositório.
 *
 * `favorite_places` e `recent_places` não existem no schema oficial da APOIS
 * Corridas. Como o Passageiro canônico vive em repositório próprio, este
 * módulo não cria tabelas fantasma nem altera produção só para manter código
 * legado compilando; ele preserva a experiência local isolada por usuário.
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
  const now = new Date().toISOString();
  const created: FavoritePlace = {
    id: newId(),
    user_id: userId,
    label: fav.label,
    kind: fav.kind,
    address: fav.address,
    lat: fav.lat,
    lng: fav.lng,
    icon: fav.icon ?? null,
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
  const index = cache.favorites.findIndex((item) => item.id === id);
  if (index < 0) return;
  cache.favorites[index] = {
    ...cache.favorites[index],
    ...patch,
    icon: patch.icon === undefined ? cache.favorites[index].icon : patch.icon,
    updated_at: new Date().toISOString(),
  };
  writeCache(userId, cache);
}

export async function deleteFavorite(id: string): Promise<void> {
  const userId = await uid();
  const cache = readCache(userId);
  cache.favorites = cache.favorites.filter((item) => item.id !== id);
  writeCache(userId, cache);
}

export async function listRecentPlaces(limit = 8): Promise<RecentPlace[]> {
  const userId = await uid();
  return [...readCache(userId).recents]
    .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
    .slice(0, Math.max(0, limit));
}

export async function registerRecentPlace(p: {
  address: string;
  lat: number;
  lng: number;
  place_id?: string | null;
}): Promise<void> {
  const userId = await uid();
  const cache = readCache(userId);
  const now = new Date().toISOString();
  const existing = cache.recents.find((item) => item.address === p.address);
  if (existing) {
    existing.lat = p.lat;
    existing.lng = p.lng;
    existing.place_id = p.place_id ?? existing.place_id;
    existing.use_count += 1;
    existing.last_used_at = now;
  } else {
    cache.recents.push({
      id: newId(),
      user_id: userId,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      place_id: p.place_id ?? null,
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
  cache.recents = cache.recents.filter((item) => item.id !== id);
  writeCache(userId, cache);
}
