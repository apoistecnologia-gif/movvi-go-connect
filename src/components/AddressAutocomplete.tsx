import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { Loader2, MapPin, Search } from "lucide-react";
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMaps";

export type PickedAddress = {
  address: string;
  lat: number;
  lng: number;
};

interface AddressAutocompleteProps {
  label: string;
  value: string;
  placeholder?: string;
  onPick: (place: PickedAddress) => void;
  onChangeText?: (text: string) => void;
  disabled?: boolean;
}

/**
 * MOVVI reusable address search — same behavior as the ride flow:
 * Google Places AutocompleteSuggestion, session token, BR-only, dark styling.
 * Selecting a suggestion fills address + lat/lng via onPick.
 */
export function AddressAutocomplete({
  label,
  value,
  placeholder = "Digite um endereço",
  onPick,
  onChangeText,
  disabled,
}: AddressAutocompleteProps) {
  const { isLoaded } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  const [q, setQ] = useState(value);
  const [suggestions, setSuggestions] = useState<
    Array<{ placeId: string; text: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debRef = useRef<number | null>(null);
  const lastPickedRef = useRef<string>(value);

  useEffect(() => {
    // Sync when parent updates value externally (e.g. after picking).
    setQ(value);
    lastPickedRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!isLoaded) return;
    const query = q.trim();
    if (!query || query === lastPickedRef.current) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    if (debRef.current) window.clearTimeout(debRef.current);
    setLoading(true);
    debRef.current = window.setTimeout(async () => {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await google.maps.importLibrary(
            "places",
          )) as google.maps.PlacesLibrary;
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: tokenRef.current,
          includedRegionCodes: ["br"],
          language: "pt-BR",
        });
        setSuggestions(
          (res.suggestions ?? [])
            .map((s) => {
              const p = s.placePrediction;
              if (!p) return null;
              return { placeId: p.placeId, text: p.text?.toString() ?? "" };
            })
            .filter(Boolean) as Array<{ placeId: string; text: string }>,
        );
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[MOVVI] autocomplete failed", e);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debRef.current) window.clearTimeout(debRef.current);
    };
  }, [q, isLoaded]);

  const choose = async (placeId: string, text: string) => {
    try {
      const { Place } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      const loc = place.location;
      if (!loc) throw new Error("Sem coordenadas");
      const addr = place.formattedAddress || text;
      lastPickedRef.current = addr;
      setQ(addr);
      setSuggestions([]);
      tokenRef.current = null;
      onPick({ address: addr, lat: loc.lat(), lng: loc.lng() });
      onChangeText?.(addr);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[MOVVI] place fetch failed", e);
    }
  };

  const showEmpty =
    focused && !loading && q.trim().length > 2 && suggestions.length === 0;

  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-[12.5px] font-semibold text-foreground">
          {label}
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            disabled={disabled || !isLoaded}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onChange={(e) => {
              setQ(e.target.value);
              onChangeText?.(e.target.value);
            }}
            placeholder={isLoaded ? placeholder : "Carregando busca…"}
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-60"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </label>
      {suggestions.length > 0 && (
        <ul className="max-h-64 overflow-auto rounded-xl border border-border bg-card shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s.placeId, s.text)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-[13px] text-foreground transition hover:bg-white/[0.04]"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="break-words">{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showEmpty && (
        <p className="px-1 text-[11.5px] text-muted-foreground">
          Nenhum endereço encontrado. Continue digitando ou tente ser mais
          específico.
        </p>
      )}
    </div>
  );
}
