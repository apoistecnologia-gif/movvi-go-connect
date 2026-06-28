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

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Não autenticado");
  return data.user.id;
}

export async function listFavorites(): Promise<FavoritePlace[]> {
  const user_id = await uid();
  const { data, error } = await supabase
    .from("favorite_places")
    .select("*")
    .eq("user_id", user_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FavoritePlace[];
}

export async function createFavorite(fav: NewFavorite): Promise<FavoritePlace> {
  const user_id = await uid();
  const { data, error } = await supabase
    .from("favorite_places")
    .insert({ ...fav, user_id, icon: fav.icon ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data as FavoritePlace;
}

export async function updateFavorite(id: string, patch: Partial<NewFavorite>): Promise<void> {
  const { error } = await supabase.from("favorite_places").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteFavorite(id: string): Promise<void> {
  const { error } = await supabase.from("favorite_places").delete().eq("id", id);
  if (error) throw error;
}

export async function listRecentPlaces(limit = 8): Promise<RecentPlace[]> {
  const user_id = await uid();
  const { data, error } = await supabase
    .from("recent_places")
    .select("*")
    .eq("user_id", user_id)
    .order("last_used_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RecentPlace[];
}

export async function registerRecentPlace(p: {
  address: string;
  lat: number;
  lng: number;
  place_id?: string | null;
}): Promise<void> {
  const user_id = await uid();
  // Upsert by (user_id, address). Bump counter and last_used_at.
  const { data: existing } = await supabase
    .from("recent_places")
    .select("id, use_count")
    .eq("user_id", user_id)
    .eq("address", p.address)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("recent_places")
      .update({ use_count: (existing.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("recent_places").insert({
      user_id,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      place_id: p.place_id ?? null,
    });
  }
}

export async function deleteRecentPlace(id: string): Promise<void> {
  const { error } = await supabase.from("recent_places").delete().eq("id", id);
  if (error) throw error;
}
