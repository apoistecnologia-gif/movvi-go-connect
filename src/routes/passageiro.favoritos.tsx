import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Briefcase, Heart, Home, MapPin, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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
  head: () => ({ meta: [{ title: "Favoritos — MOVVI DRIVE" }] }),
  component: FavoritosPage,
});

function kindMeta(kind: FavoriteKind): { label: string; Icon: typeof Home; color: string } {
  if (kind === "home") return { label: "Casa", Icon: Home, color: "text-[#8DD92B]" };
  if (kind === "work") return { label: "Trabalho", Icon: Briefcase, color: "text-blue-400" };
  return { label: "Personalizado", Icon: Heart, color: "text-pink-400" };
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
    <div className="min-h-dvh bg-[#05070D] text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/5 bg-[#05070D]/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate({ to: "/passageiro/app" })}
          className="rounded-full p-2 transition hover:bg-white/5"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Endereços favoritos</h1>
          <p className="text-xs text-white/50">Casa, trabalho e lugares frequentes</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-white/40">Carregando…</p>
        ) : (
          <>
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

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white/80">Personalizados</h2>
                <button
                  onClick={() => setCreatingKind("custom")}
                  className="inline-flex items-center gap-1 rounded-full bg-[#8DD92B]/10 px-3 py-1.5 text-xs font-semibold text-[#8DD92B] transition hover:bg-[#8DD92B]/20"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </button>
              </div>
              {custom.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/40">
                  Nenhum favorito personalizado ainda.
                </p>
              ) : (
                <ul className="space-y-2">
                  {custom.map((f) => (
                    <FavoriteRow key={f.id} fav={f} onEdit={() => setEditing(f)} onRemove={() => onRemove(f.id)} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

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
  const { label, Icon, color } = kindMeta(kind);
  if (fav) {
    return (
      <button
        onClick={() => onEdit(fav)}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#121826] px-4 py-3 text-left transition hover:border-[#8DD92B]/40"
      >
        <span className={`grid h-10 w-10 place-items-center rounded-full bg-white/5 ${color}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block truncate text-xs text-white/60">{fav.address}</span>
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(fav.id);
          }}
          className="rounded-full p-2 text-white/40 transition hover:bg-white/5 hover:text-red-400"
          aria-label="Remover"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <Pencil className="h-4 w-4 text-white/40" />
      </button>
    );
  }
  return (
    <button
      onClick={onAdd}
      className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-left transition hover:border-[#8DD92B]/40 hover:bg-[#8DD92B]/[0.04]"
    >
      <span className={`grid h-10 w-10 place-items-center rounded-full bg-white/5 ${color}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Adicionar {label}</span>
        <span className="block text-xs text-white/40">Defina seu endereço de {label.toLowerCase()}</span>
      </span>
      <Plus className="h-4 w-4 text-[#8DD92B]" />
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
    <li className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#121826] px-4 py-3">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-pink-500/10 text-pink-400">
        <Heart className="h-5 w-5" />
      </span>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold">{fav.label}</span>
        <span className="block truncate text-xs text-white/60">{fav.address}</span>
      </button>
      <button
        onClick={onEdit}
        className="rounded-full p-2 text-white/40 transition hover:bg-white/5 hover:text-white"
        aria-label="Editar"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={onRemove}
        className="rounded-full p-2 text-white/40 transition hover:bg-white/5 hover:text-red-400"
        aria-label="Remover"
      >
        <Trash2 className="h-4 w-4" />
      </button>
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
    id: "google-map-script",
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
