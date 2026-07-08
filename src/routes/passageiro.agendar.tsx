import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, Loader2 } from "lucide-react";

import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { AddressAutocomplete, type PickedAddress } from "@/components/AddressAutocomplete";
import { DSButton } from "@/design-system";
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMaps";
import { RIDE_CATEGORIES, type RideCategory } from "@/lib/rideCategories";
import { agendarCorrida } from "@/lib/rideLifecycle";

// Minimum lead time: 15 minutes; max: 30 days.
function minLocalIso(offsetMinutes = 20) {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  d.setSeconds(0, 0);
  const tz = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}
function maxLocalIso() {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const tz = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function SchedulePage() {
  const nav = useNavigate();
  const call = useServerFn(agendarCorrida);
  const { isLoaded } = useJsApiLoader({
    id: "movvi-google-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: "pt-BR",
    region: "BR",
  });

  const [origin, setOrigin] = useState<PickedAddress | null>(null);
  const [dest, setDest] = useState<PickedAddress | null>(null);
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [category, setCategory] = useState<RideCategory>("carros");
  const [when, setWhen] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const minWhen = useMemo(() => minLocalIso(20), []);
  const maxWhen = useMemo(() => maxLocalIso(), []);

  async function computeRouteMetrics(o: PickedAddress, d: PickedAddress) {
    if (!isLoaded) return { km: null as number | null, min: null as number | null };
    try {
      const svc = new google.maps.DirectionsService();
      const res = await svc.route({
        origin: { lat: o.lat, lng: o.lng },
        destination: { lat: d.lat, lng: d.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      });
      const leg = res.routes[0]?.legs[0];
      if (!leg) return { km: null, min: null };
      return {
        km: (leg.distance?.value ?? 0) / 1000,
        min: (leg.duration?.value ?? 0) / 60,
      };
    } catch {
      return { km: null, min: null };
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !dest) {
      toast.error("Selecione origem e destino nas sugestões.");
      return;
    }
    if (!when) {
      toast.error("Escolha a data e hora do agendamento.");
      return;
    }
    const whenDate = new Date(when);
    if (whenDate.getTime() - Date.now() < 15 * 60 * 1000) {
      toast.error("Agende com pelo menos 15 minutos de antecedência.");
      return;
    }
    setSaving(true);
    try {
      const { km, min } = await computeRouteMetrics(origin, dest);
      const res = await call({
        data: {
          origin: { lat: origin.lat, lng: origin.lng },
          origin_name: origin.address,
          destination: { lat: dest.lat, lng: dest.lng },
          destination_name: dest.address,
          category,
          distance_km: km,
          duration_min: min,
          scheduled_for: whenDate.toISOString(),
          pickup_source: "places",
        },
      });
      toast.success(
        res.estimatedPrice
          ? `Agendada! Estimativa R$ ${Number(res.estimatedPrice).toFixed(2)}`
          : "Corrida agendada.",
      );
      nav({ to: "/passageiro/corridas" });
    } catch (err) {
      toast.error((err as Error).message || "Falha ao agendar corrida.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F9F7]">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28">
        <div className="container mx-auto max-w-xl">
          <button
            type="button"
            onClick={() => nav({ to: "/passageiro/corridas" })}
            className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#111418]"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>

          <header className="mb-5">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#76C139]/12 px-3 py-1 text-[12px] font-semibold text-[#4d8823]">
              <CalendarClock className="h-3.5 w-3.5" /> Agendamento
            </div>
            <h1 className="text-[26px] font-bold tracking-tight text-[#111418]">
              Agendar uma corrida
            </h1>
            <p className="mt-1 text-[13px] text-[#707070]">
              Escolha o horário e MOVVI começa a buscar motorista automaticamente ~15 min antes.
            </p>
          </header>

          <form
            onSubmit={submit}
            className="space-y-4 rounded-[24px] bg-white p-5 ring-1 ring-black/5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.22)]"
          >
            <AddressAutocomplete
              label="Origem"
              value={originText}
              placeholder="De onde vamos partir?"
              onPick={(p) => {
                setOrigin(p);
                setOriginText(p.address);
              }}
              onChangeText={(t) => {
                setOriginText(t);
                if (origin && t !== origin.address) setOrigin(null);
              }}
            />

            <AddressAutocomplete
              label="Destino"
              value={destText}
              placeholder="Para onde vamos?"
              onPick={(p) => {
                setDest(p);
                setDestText(p.address);
              }}
              onChangeText={(t) => {
                setDestText(t);
                if (dest && t !== dest.address) setDest(null);
              }}
            />

            <div className="space-y-1.5">
              <span className="text-[12.5px] font-semibold text-foreground">Categoria</span>
              <div className="grid grid-cols-3 gap-2">
                {RIDE_CATEGORIES.filter((c) => c.key !== "guincho" && c.key !== "fretes").map(
                  (c) => {
                    const active = category === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setCategory(c.key)}
                        className={`rounded-2xl border px-3 py-2 text-[13px] font-semibold transition ${
                          active
                            ? "border-[#76C139] bg-[#76C139]/10 text-[#111418]"
                            : "border-border bg-background text-[#707070]"
                        }`}
                      >
                        <span className="mr-1">{c.emoji}</span>
                        {c.label}
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-semibold text-foreground">
                Data e hora
              </span>
              <input
                type="datetime-local"
                value={when}
                min={minWhen}
                max={maxWhen}
                onChange={(e) => setWhen(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary"
              />
              <span className="text-[11.5px] text-muted-foreground">
                Mínimo 15 min a partir de agora, máximo 30 dias.
              </span>
            </label>

            <DSButton type="submit" className="w-full" disabled={saving || !isLoaded}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar agendamento
            </DSButton>
          </form>
        </div>
      </main>
      <BottomNav items={PASSENGER_NAV} floating theme="dark" />
    </div>
  );
}

export const Route = createFileRoute("/passageiro/agendar")({
  head: () => ({ meta: [{ title: "Agendar corrida — MOVVI DRIVE" }] }),
  component: SchedulePage,
});
