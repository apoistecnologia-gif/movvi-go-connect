import { useEffect, useId, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { AlertCircle, Loader2, MapPin, Search } from "lucide-react";
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

type Suggestion = { placeId: string; text: string };

export function AddressAutocomplete({
  label,
  value,
  placeholder = "Digite um endereço",
  onPick,
  onChangeText,
  disabled,
}: AddressAutocompleteProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  const fieldId = useId();
  const listId = `${fieldId}-suggestions`;
  const statusId = `${fieldId}-status`;
  const [q, setQ] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const lastPickedRef = useRef<string>(value);

  useEffect(() => {
    setQ(value);
    lastPickedRef.current = value;
    setError(null);
  }, [value]);

  useEffect(() => {
    if (loadError) {
      setLoading(false);
      setSuggestions([]);
      setError("A busca de endereços está indisponível agora. Tente novamente em instantes.");
      return;
    }
    if (!isLoaded) return;
    const query = q.trim();
    if (debRef.current) window.clearTimeout(debRef.current);
    if (query.length < 3 || query === lastPickedRef.current.trim()) {
      requestRef.current += 1;
      setSuggestions([]);
      setActiveIndex(-1);
      setLoading(false);
      if (query.length < 3) setError(null);
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    debRef.current = window.setTimeout(async () => {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: tokenRef.current,
          includedRegionCodes: ["br"],
          language: "pt-BR",
        });
        if (requestId !== requestRef.current) return;
        const seen = new Set<string>();
        const next = (res.suggestions ?? [])
          .map((s) => {
            const p = s.placePrediction;
            if (!p) return null;
            const text = p.text?.toString().trim() ?? "";
            if (!p.placeId || !text || seen.has(p.placeId)) return null;
            seen.add(p.placeId);
            return { placeId: p.placeId, text };
          })
          .filter((item): item is Suggestion => Boolean(item));
        setSuggestions(next);
        setActiveIndex(next.length ? 0 : -1);
      } catch {
        if (requestId !== requestRef.current) return;
        setSuggestions([]);
        setActiveIndex(-1);
        setError("Não foi possível buscar endereços agora. Verifique sua conexão e tente novamente.");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 250);

    return () => {
      if (debRef.current) window.clearTimeout(debRef.current);
    };
  }, [q, isLoaded, loadError]);

  const choose = async (placeId: string, text: string) => {
    if (choosing || disabled) return;
    setChoosing(true);
    setError(null);
    try {
      const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      const loc = place.location;
      const lat = loc?.lat();
      const lng = loc?.lng();
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat as number) > 90 || Math.abs(lng as number) > 180) {
        throw new Error("invalid_location");
      }
      const addr = String(place.formattedAddress || text).trim();
      if (!addr) throw new Error("invalid_address");
      lastPickedRef.current = addr;
      setQ(addr);
      setSuggestions([]);
      setActiveIndex(-1);
      tokenRef.current = null;
      onPick({ address: addr, lat: lat as number, lng: lng as number });
      onChangeText?.(addr);
    } catch {
      setError("Não foi possível abrir este endereço. Escolha outra sugestão ou tente novamente.");
    } finally {
      setChoosing(false);
    }
  };

  const showEmpty = focused && !loading && !error && q.trim().length >= 3 && suggestions.length === 0;
  const listVisible = focused && suggestions.length > 0;
  const activeId = listVisible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-semibold text-foreground">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id={fieldId}
          value={q}
          disabled={disabled || !isLoaded || choosing}
          role="combobox"
          aria-expanded={listVisible}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-describedby={statusId}
          autoComplete="street-address"
          enterKeyHint="search"
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 180)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSuggestions([]);
              setActiveIndex(-1);
              return;
            }
            if (!listVisible) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => (current + 1) % suggestions.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              const selected = suggestions[activeIndex];
              if (selected) void choose(selected.placeId, selected.text);
            }
          }}
          onChange={(e) => {
            const next = e.target.value;
            setQ(next);
            setError(null);
            lastPickedRef.current = "";
            onChangeText?.(next);
          }}
          placeholder={loadError ? "Busca indisponível" : isLoaded ? placeholder : "Carregando busca…"}
          className="min-h-12 w-full rounded-xl border border-border bg-background pl-9 pr-10 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {(loading || choosing) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
        )}
      </div>

      {listVisible && (
        <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-lg">
          {suggestions.map((s, index) => (
            <li key={s.placeId} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void choose(s.placeId, s.text)}
                disabled={choosing}
                className={`flex min-h-12 w-full min-w-0 items-start gap-2 px-3 py-3 text-left text-sm text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 disabled:opacity-60 ${index === activeIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 break-words">{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div id={statusId} aria-live="polite">
        {loading ? <p className="px-1 text-xs text-muted-foreground">Buscando endereços…</p> : null}
        {error ? (
          <p role="alert" className="flex items-start gap-1.5 px-1 text-xs leading-5 text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
        {showEmpty ? (
          <p className="px-1 text-xs leading-5 text-muted-foreground">
            Nenhum endereço encontrado. Continue digitando ou tente ser mais específico.
          </p>
        ) : null}
      </div>
    </div>
  );
}
