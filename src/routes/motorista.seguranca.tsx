import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Phone,
  Plus,
  Share2,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { supabase } from "@/integrations/supabase/client";
import { loadDriverProfile } from "@/lib/driverProfile";
import { toast } from "sonner";

export const Route = createFileRoute("/motorista/seguranca")({
  head: () => ({ meta: [{ title: "Segurança — APOIS Motorista" }] }),
  component: DriverSecurityPage,
});

type Contact = {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  is_primary: boolean;
};

function DriverSecurityPage() {
  const navigate = useNavigate();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [mobilityUserId, setMobilityUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [adding, setAdding] = useState(false);
  const db = supabase as any;

  const load = useCallback(async (id: string) => {
    const { data, error } = await db
      .from("driver_emergency_contacts")
      .select("id,name,phone,relation,is_primary")
      .eq("driver_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[APOIS Motorista] contatos de emergência:", error);
      toast.error("Não foi possível carregar os contatos de emergência.");
    }
    setContacts((data ?? []) as Contact[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const profile = await loadDriverProfile();
      if (!alive) return;
      if (!profile.ok) {
        await navigate({
          to: profile.reason === "no_session" ? "/motorista/login" : "/motorista/status",
        });
        return;
      }
      setDriverId(profile.profile.id);
      setMobilityUserId(profile.profile.user_id);
      await load(profile.profile.id);
    })();
    return () => {
      alive = false;
    };
  }, [load, navigate]);

  async function addContact() {
    if (!driverId || !name.trim() || !phone.trim() || adding) return;
    setAdding(true);
    const { error } = await db.from("driver_emergency_contacts").insert({
      driver_id: driverId,
      name: name.trim(),
      phone: phone.trim(),
      relation: relation.trim() || null,
      is_primary: contacts.length === 0,
    });
    setAdding(false);
    if (error) {
      toast.error("Não foi possível adicionar o contato.");
      return;
    }
    setName("");
    setPhone("");
    setRelation("");
    await load(driverId);
    toast.success("Contato de emergência adicionado.");
  }

  async function setPrimary(id: string) {
    if (!driverId) return;
    const { error: clearError } = await db
      .from("driver_emergency_contacts")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("driver_id", driverId);
    if (clearError) return toast.error("Não foi possível atualizar o contato principal.");

    const { error } = await db
      .from("driver_emergency_contacts")
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("driver_id", driverId);
    if (error) return toast.error("Não foi possível definir o contato principal.");
    await load(driverId);
  }

  async function remove(id: string) {
    if (!driverId) return;
    const removedWasPrimary = contacts.some((contact) => contact.id === id && contact.is_primary);
    const { error } = await db
      .from("driver_emergency_contacts")
      .delete()
      .eq("id", id)
      .eq("driver_id", driverId);
    if (error) return toast.error("Não foi possível excluir o contato.");

    await load(driverId);
    if (removedWasPrimary) {
      const remaining = contacts.find((contact) => contact.id !== id);
      if (remaining) await setPrimary(remaining.id);
    }
  }

  async function triggerSOS() {
    if (!driverId || !mobilityUserId) return;
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (value) => resolve(value),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 5000 },
      );
    });

    const { error } = await db.rpc("create_driver_sos", {
      _lat: pos?.coords.latitude ?? null,
      _lng: pos?.coords.longitude ?? null,
      _severity: "critical",
      _message: "SOS acionado pelo motorista no aplicativo APOIS.",
    });
    if (error) toast.error("Não foi possível registrar o alerta SOS.");
    else toast.success("Alerta SOS registrado e enviado para a central APOIS.");
  }

  function shareLocation() {
    if (!navigator.geolocation) {
      toast.error("GPS indisponível.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const url = `https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`;
        if (navigator.share) {
          await navigator.share({
            title: "Minha localização — APOIS",
            text: "Estou aqui agora:",
            url,
          });
        } else {
          await navigator.clipboard.writeText(url);
          toast.success("Link da localização copiado.");
        }
      },
      () => toast.error("Não foi possível obter sua localização."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#050607] text-white">
      <MovviHeader logoutRedirect="/" />

      <main className="mx-auto w-full max-w-xl space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-5">
        <section className="rounded-[26px] border border-red-400/15 bg-[#0D0F11] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-400/10 text-red-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Proteção APOIS</p>
              <h1 className="mt-1 text-xl font-black">Segurança</h1>
              <p className="mt-1 text-[11px] font-medium text-zinc-500">Ajuda rápida e contatos de emergência.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void triggerSOS()}
            className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-red-500 px-4 text-sm font-black text-white active:scale-[0.99]"
          >
            <AlertTriangle className="h-5 w-5" />
            Acionar SOS
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <a
              href="tel:190"
              className="flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-white/8 bg-[#111315] text-xs font-black text-white"
            >
              <Phone className="h-4 w-4 text-[#F6BE1C]" /> Polícia 190
            </a>
            <button
              type="button"
              onClick={shareLocation}
              className="flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-white/8 bg-[#111315] text-xs font-black text-white"
            >
              <Share2 className="h-4 w-4 text-[#F6BE1C]" /> Compartilhar
            </button>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/5 bg-[#0D0F11] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Rede de apoio</p>
              <h2 className="mt-1 text-base font-black">Contatos de emergência</h2>
            </div>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-black text-zinc-500">{contacts.length}</span>
          </div>

          {loading ? (
            <div className="flex min-h-20 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#F6BE1C]" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="rounded-2xl border border-white/5 bg-[#111315] p-4 text-center text-[11px] font-medium text-zinc-600">
              Nenhum contato cadastrado.
            </p>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <article key={contact.id} className="flex items-center gap-3 rounded-[18px] border border-white/5 bg-[#111315] p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[12px] font-black text-white">{contact.name}</p>
                      {contact.is_primary ? <Star className="h-3.5 w-3.5 fill-[#F6BE1C] text-[#F6BE1C]" /> : null}
                    </div>
                    <p className="mt-1 truncate text-[10px] font-medium text-zinc-600">
                      {contact.phone}{contact.relation ? ` · ${contact.relation}` : ""}
                    </p>
                  </div>
                  <a href={`tel:${contact.phone}`} aria-label={`Ligar para ${contact.name}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6BE1C]/10 text-[#F6BE1C]">
                    <Phone className="h-4 w-4" />
                  </a>
                  {!contact.is_primary ? (
                    <button type="button" onClick={() => void setPrimary(contact.id)} aria-label="Definir contato principal" className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void remove(contact.id)} aria-label="Excluir contato" className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-400/8 text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-white/5 bg-[#0D0F11] p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Adicionar contato</p>
          <div className="mt-3 space-y-2.5">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome"
              className="min-h-12 w-full rounded-[16px] border border-white/8 bg-[#111315] px-4 text-sm font-semibold text-white outline-none placeholder:text-zinc-700 focus:border-[#F6BE1C]/50"
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Telefone"
              inputMode="tel"
              className="min-h-12 w-full rounded-[16px] border border-white/8 bg-[#111315] px-4 text-sm font-semibold text-white outline-none placeholder:text-zinc-700 focus:border-[#F6BE1C]/50"
            />
            <input
              value={relation}
              onChange={(event) => setRelation(event.target.value)}
              placeholder="Parentesco ou relação (opcional)"
              className="min-h-12 w-full rounded-[16px] border border-white/8 bg-[#111315] px-4 text-sm font-semibold text-white outline-none placeholder:text-zinc-700 focus:border-[#F6BE1C]/50"
            />
            <button
              type="button"
              onClick={() => void addContact()}
              disabled={!name.trim() || !phone.trim() || adding}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#F6BE1C] px-4 text-xs font-black text-black disabled:opacity-40"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar contato
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
