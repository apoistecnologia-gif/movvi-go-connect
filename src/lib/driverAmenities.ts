// APOIS — Regalias oferecidas pelo motorista (opt-in por item).
// Cada motorista escolhe o que quer oferecer a bordo. Passageiros veem no perfil público.
import {
  Droplet,
  Candy,
  Music,
  Dog,
  Luggage,
  Snowflake,
  Wifi,
  Baby,
  VolumeX,
  BatteryCharging,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type DriverAmenities = {
  charger: boolean;
  water: boolean;
  candy: boolean;
  music_on_demand: boolean;
  pet_friendly: boolean;
  large_luggage: boolean;
  air_conditioning: boolean;
  wifi: boolean;
  child_seat: boolean;
  quiet_ride: boolean;
};

export const DEFAULT_AMENITIES: DriverAmenities = {
  charger: false,
  water: false,
  candy: false,
  music_on_demand: false,
  pet_friendly: false,
  large_luggage: false,
  air_conditioning: false,
  wifi: false,
  child_seat: false,
  quiet_ride: false,
};

export type AmenityKey = keyof DriverAmenities;

type DriverAmenitiesRow = DriverAmenities & { user_id: string };
type DriverAmenitiesDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      driver_amenities: {
        Row: DriverAmenitiesRow;
        Insert: { user_id: string } & Partial<DriverAmenities>;
        Update: { user_id?: string } & Partial<DriverAmenities>;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      get_driver_amenities_public: {
        Args: { target_user_id: string };
        Returns: DriverAmenities[];
      };
    };
  };
};

const amenitiesSupabase = supabase as unknown as SupabaseClient<DriverAmenitiesDatabase>;

export const AMENITY_META: Record<
  AmenityKey,
  { label: string; hint: string; icon: LucideIcon }
> = {
  charger: {
    label: "Carregador",
    hint: "USB-C e Lightning disponíveis",
    icon: BatteryCharging,
  },
  water: { label: "Água", hint: "Garrafinha cortesia", icon: Droplet },
  candy: { label: "Balas / doces", hint: "Snacks cortesia", icon: Candy },
  music_on_demand: {
    label: "Música sob demanda",
    hint: "Passageiro escolhe o estilo",
    icon: Music,
  },
  pet_friendly: {
    label: "Pet friendly",
    hint: "Aceita animais com transportadora",
    icon: Dog,
  },
  large_luggage: {
    label: "Bagagem grande",
    hint: "Espaço para malas grandes",
    icon: Luggage,
  },
  air_conditioning: {
    label: "Ar-condicionado",
    hint: "Sempre disponível",
    icon: Snowflake,
  },
  wifi: { label: "Wi-Fi a bordo", hint: "Internet no carro", icon: Wifi },
  child_seat: {
    label: "Cadeirinha",
    hint: "Sob solicitação prévia",
    icon: Baby,
  },
  quiet_ride: {
    label: "Viagem silenciosa",
    hint: "Conversa mínima se preferir",
    icon: VolumeX,
  },
};

const CACHE_KEY = (uid: string) => `movvi:driver:amenities:${uid}`;

function normalize(row: Partial<DriverAmenities> | null | undefined): DriverAmenities {
  return { ...DEFAULT_AMENITIES, ...(row ?? {}) };
}

export async function loadDriverAmenities(userId: string): Promise<DriverAmenities> {
  try {
    const cached = localStorage.getItem(CACHE_KEY(userId));
    if (cached) {
      void refreshFromDb(userId);
      return normalize(JSON.parse(cached) as Partial<DriverAmenities>);
    }
  } catch {
    // Cache local é opcional; falhas não podem impedir o carregamento pelo banco.
  }
  return refreshFromDb(userId);
}

async function refreshFromDb(userId: string): Promise<DriverAmenities> {
  const { data, error } = await amenitiesSupabase
    .from("driver_amenities")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (import.meta.env.DEV) console.warn("[APOIS AMENITIES] load", error.message);
    return DEFAULT_AMENITIES;
  }
  const prefs = normalize(data);
  try {
    localStorage.setItem(CACHE_KEY(userId), JSON.stringify(prefs));
  } catch {
    // Persistência local é apenas otimização de UX.
  }
  return prefs;
}

export async function saveDriverAmenities(
  userId: string,
  prefs: DriverAmenities,
): Promise<void> {
  try {
    localStorage.setItem(CACHE_KEY(userId), JSON.stringify(prefs));
  } catch {
    // A gravação canônica continua sendo o Supabase.
  }
  const { error } = await amenitiesSupabase
    .from("driver_amenities")
    .upsert({ user_id: userId, ...prefs }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function fetchDriverAmenitiesPublic(userId: string): Promise<DriverAmenities> {
  // Uses SECURITY DEFINER RPC so passengers can read amenities without a broad SELECT policy.
  const { data, error } = await amenitiesSupabase.rpc("get_driver_amenities_public", {
    target_user_id: userId,
  });
  if (error) {
    if (import.meta.env.DEV) console.warn("[APOIS AMENITIES] public", error.message);
    return DEFAULT_AMENITIES;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return normalize(row as Partial<DriverAmenities> | null);
}

export function enabledAmenities(prefs: DriverAmenities): AmenityKey[] {
  return (Object.keys(AMENITY_META) as AmenityKey[]).filter((k) => prefs[k]);
}
