import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  ChevronRight,
  Heart,
  Home,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createFavorite,
  deleteFavorite,
  listFavorites,
  updateFavorite,
  type FavoriteKind,
  type FavoritePlace,
} from "@/lib/favoritePlaces";
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMaps";
import { useJsApiLoader } from "@react-google-maps/api";

export const Route = createFileRoute("/passageiro/favoritos")({
  head: () => ({ meta: [{ title: "Favoritos — APOIS" }] }),
  component: FavoritosPage,
});

function kindMeta(kind: FavoriteKind): { label: string; Icon: typeof Home } {
  if (kind === "home") return { label: "Casa", Icon: Home };
  if (kind === "work") return { label: "Trabalho", Icon: Briefcase };
  return { label: "Personalizado", Icon: Heart };
}

function FavoritosPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FavoritePlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FavoritePlace | null>(null);
  const [creatingKind, setCreatingKind] = useState<FavoriteKind | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listFavorites());
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar favoritos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const home = items.find((i) => i.kind === "home");
  const work = items.find((i) => i.kind === "work");
  const custom = items.filter((i) => i.kind === "custom");

  const onRemove = async (id: string) => {
    if (!confirm("Remover este favorito?")) return;
    try {
      await deleteFavorite(id);
      toast.success("Favorito removido");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao remover");
    }
  };

  return (
    <div className="min-h-dvh bg-[#F7F9F7] text-[#111418]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/5 bg-[#F7F9F7]/90 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/passageiro/app" })}
          className="rounded-full p-2 transition duration-200 hover:bg-black/5 active:scale-95"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5 text-[#111418]" strokeWidth={2} />
        </button>
        <span className="flex-1" />
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-32">
        {/* Header */}
        <section className="mb-6 animate-in fade-in slide-in-from-top-1 duration-300">
          <h1 className="text-[24px] font-bold tracking-tight text-[#111418]">
            Locais favoritos
          </h1>
          <p className="mt-1 text-[13px] text-[#707070]">
            Acesse seus destinos mais usados em segundos.
          </p>
        </section>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[76px] animate-pulse rounded-[24px] bg-white ring-1 ring-black/5"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Home & Work */}
            <section className="mb-6 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-[220ms]">
              <FavoriteSlot
                kind="home"
                fav={home}
                onAdd={() => setCreatingKind("home")}
                onEdit={(f) => setEditing(f)}
                onRemove={onRemove}
              />
              <FavoriteSlot
                kind="work"
                fav={work}
                onAdd={() => setCreatingKind("work")}
                onEdit={(f) => setEditing(f)}
                onRemove={onRemove}
              />
            </section>

            {/* Favorites */}
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-[220ms]">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#707070]">
                  Meus favoritos
                </h2>
                <span className="text-[12px] text-[#707070]">
                  {custom.length} {custom.length === 1 ? "local" : "locais"}
                </span>
              </div>

              {custom.length === 0 ? (
                <div className="rounded-[24px] bg-white p-8 text-center ring-1 ring-black/5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)]">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#76C139]/12">
                    <Heart className="h-7 w-7 text-[#76C139]" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-[18px] font-semibold text-[#111418]">
                    Nenhum favorito ainda
                  </h3>
                  <p className="mt-1 text-[13px] text-[#707070]">
                    Salve seus destinos mais visitados para pedir corridas mais rápido.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {custom.map((f) => (
                    <FavoriteRow
                      key={f.id}
                      fav={f}
                      onEdit={() => setEditing(f)}
                      onRemove={() => onRemove(f.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      {/* Floating add button */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button
          onClick={() => setCreatingKind("custom")}
          className="pointer-events-auto flex h-14 items-center justify-center gap-2 rounded-full border-2 border-[#76C139] bg-white px-6 text-[14px] font-bold text-[#76C139] shadow-[0_18px_40px_-18px_rgba(118,193,57,0.55)] transition duration-[220ms] active:scale-[0.97] hover:bg-[#76C139]/8"
        >
          <Plus className="h-5 w-5" strokeWidth={2.4} />
          Adicionar local
        </button>
      </div>

      {(creatingKind || editing) && (
        <FavoriteEditor
          initial={editing ?? undefined}
          kind={editing?.kind ?? creatingKind ?? "custom"}
          onClose={() => {
            setCreatingKind(null);
            setEditing(null);
          }}
          onSaved={() => {
            setCreatingKind(null);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function FavoriteSlot({
  kind,
  fav,
  onAdd,
  onEdit,
  onRemove,
}: {
  kind: FavoriteKind;
  fav: FavoritePlace | undefined;
  onAdd: () => void;
  onEdit: (f: FavoritePlace) => void;
  onRemove: (id: string) => void;
}) {
  const { label, Icon } = kindMeta(kind);
  if (fav) {
    return (
      <div className="group flex w-full items-center gap-3.5 rounded-[24px] bg-white p-4 ring-1 ring-black/5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)] transition duration-[220ms] hover:ring-[#76C139]/25">
        <button
          onClick={() => onEdit(fav)}
          className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#76C139]/12 text-[#76C139]">
            <Icon className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[18px] font-semibold leading-tight text-[#111418]">
              {label}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-[#707070]">
              {fav.address}
            </span>
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(fav.id);
          }}
          className="rounded-full p-2 text-[#707070] transition duration-200 hover:bg-[#F7F9F7] hover:text-[#c53030] active:scale-90"
          aria-label="Remover"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </button>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#707070]/60" strokeWidth={2} />
      </div>
    );
  }
  return (
    <button
      onClick={onAdd}
      className="flex w-full items-center gap-3.5 rounded-[24px] border-2 border-dashed border-[#707070]/20 bg-white/60 p-4 text-left transition duration-[220ms] hover:border-[#76C139]/40 hover:bg-white active:scale-[0.99]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F7F9F7] text-[#707070]">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold leading-tight text-[#111418]">
          Adicionar {label}
        </span>
        <span className="mt-0.5 block text-[13px] text-[#707070]">
          Defina seu endereço de {label.toLowerCase()}
        </span>
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#76C139]/12 text-[#76C139]">
        <Plus className="h-4 w-4" strokeWidth={2.4} />
      </span>
    </button>
  );
}

function FavoriteRow({
  fav,
  onEdit,
  onRemove,
}: {
  fav: FavoritePlace;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-center gap-3.5 rounded-[24px] bg-white p-4 ring-1 ring-black/5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)] transition duration-[220ms] hover:ring-[#76C139]/25 animate-in fade-in slide-in-from-bottom-1">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#76C139]/12 text-[#76C139]">
        <MapPin className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[18px] font-semibold leading-tight text-[#111418]">
          {fav.label}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-[#707070]">
          {fav.address}
        </span>
      </button>
      <button
        onClick={onEdit}
        className="rounded-full p-2 text-[#707070] transition duration-200 hover:bg-[#F7F9F7] hover:text-[#111418] active:scale-90"
        aria-label="Editar"
      >
        <Pencil className="h-4 w-4" strokeWidth={2} />
      </button>
      <button
        onClick={onRemove}
        className="rounded-full p-2 text-[#707070] transition duration-200 hover:bg-[#F7F9F7] hover:text-[#c53030] active:scale-90"
        aria-label="Remover"
      >
        <Trash2 className="h-4 w-4" strokeWidth={2} />
      </button>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#707070]/60" strokeWidth={2} />
    </li>
  );
}


interface PickedPlace {
  address: string;
  lat: number;
  lng: number;
}

function FavoriteEditor({
  initial,
  kind,
  onClose,
  onSaved,
}: {
  initial?: FavoritePlace;
  kind: FavoriteKind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { label: kindLabel } = kindMeta(kind);
  const [label, setLabel] = useState(initial?.label ?? (kind === "custom" ? "" : kindLabel));
  const [picked, setPicked] = useState<PickedPlace | null>(
    initial ? { address: initial.address, lat: initial.lat, lng: initial.lng } : null
  );
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!label.trim()) return toast.error("Defina um nome");
    if (!picked) return toast.error("Selecione um endereço");
    setSaving(true);
    try {
      if (initial) {
        await updateFavorite(initial.id, {
          label: label.trim(),
          address: picked.address,
          lat: picked.lat,
          lng: picked.lng,
        });
        toast.success("Favorito atualizado");
      } else {
        await createFavorite({
          kind,
          label: label.trim(),
          address: picked.address,
          lat: picked.lat,
          lng: picked.lng,
        });
        toast.success("Favorito salvo");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#0B1020] p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {initial ? "Editar favorito" : `Novo favorito${kind !== "custom" ? ` · ${kindLabel}` : ""}`}
          </h3>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-white/60">Nome</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={kind !== "custom" && !initial}
            placeholder="Ex.: Academia"
            className="w-full rounded-xl border border-white/10 bg-[#05070D] px-3 py-2.5 text-sm outline-none focus:border-[#8DD92B]"
          />
        </label>

        <PlaceSearch onPick={setPicked} initialValue={picked?.address ?? ""} />

        {picked && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#8DD92B]/30 bg-[#8DD92B]/5 px-3 py-2 text-xs text-white/80">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#8DD92B]" />
            <span className="break-words">{picked.address}</span>
          </div>
        )}

        <button
          onClick={onSave}
          disabled={saving}
          className="mt-5 w-full rounded-2xl bg-[#8DD92B] py-3 text-sm font-semibold text-black transition hover:bg-[#7FCB22] disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar favorito"}
        </button>
      </div>
    </div>
  );
}

function PlaceSearch({ onPick, initialValue }: { onPick: (p: PickedPlace) => void; initialValue: string }) {
  const { isLoaded } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });
  const [q, setQ] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; text: string }>>([]);
  const tokenRef = useRef<any>(null);
  const debRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isLoaded || !q.trim() || q === initialValue) {
      setSuggestions([]);
      return;
    }
    if (debRef.current) window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(async () => {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } = (await google.maps.importLibrary(
          "places"
        )) as google.maps.PlacesLibrary;
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
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
            .filter(Boolean) as Array<{ placeId: string; text: string }>
        );
      } catch (e) {
        if (import.meta.env.DEV) console.warn("autocomplete failed", e);
      }
    }, 220);
  }, [q, isLoaded, initialValue]);

  const choose = async (placeId: string, text: string) => {
    try {
      const { Place } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      const loc = place.location;
      if (!loc) throw new Error("Sem coordenadas");
      onPick({
        address: place.formattedAddress || text,
        lat: loc.lat(),
        lng: loc.lng(),
      });
      setQ(place.formattedAddress || text);
      setSuggestions([]);
      tokenRef.current = null;
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao obter endereço");
    }
  };

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-white/60">Endereço</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar endereço…"
            className="w-full rounded-xl border border-white/10 bg-[#05070D] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#8DD92B]"
          />
        </div>
      </label>
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-[#0B1020] shadow-2xl">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                onClick={() => choose(s.placeId, s.text)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-white/5"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#8DD92B]" />
                <span className="break-words">{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
