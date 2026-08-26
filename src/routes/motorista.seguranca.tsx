import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
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

function normalizePhone(value: unknown): string {
  const raw = String(value ?? "").trim();
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  return digits ? `${hasPlus ? "+" : ""}${digits}` : "";
}

function isUsablePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function safeContactName(value: unknown): string {
  return String(value ?? "").trim() || "Contato sem nome";
}

function validCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function DriverSecurityPage() {
  const navigate = useNavigate();
  const loadRequestRef = useRef(0);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [mobilityUserId, setMobilityUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);
  const [sosBusy, setSosBusy] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const db = supabase as any;

  const load = useCallback(async (id: string) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await db
      .from("driver_emergency_contacts")
      .select("id,name,phone,relation,is_primary")
      .eq("driver_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (requestId !== loadRequestRef.current) return;
    if (queryError) {
      console.error("[APOIS Motorista] contatos de emergência:", queryError);
      setError("Não foi possível carregar os contatos de emergência agora.");
      setLoading(false);
      return;
    }

    const normalized = Array.isArray(data)
      ? data.filter((item): item is Contact => Boolean(item && typeof item.id === "string"))
      : [];
    setContacts(normalized);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const profile = await loadDriverProfile();
      if (!alive) return;
      if (!profile.ok) {
        await navigate({
          to: profile.reason === "no_session" ? "/motorista/login" : "/motorista/status",
          replace: true,
        });
        return;
      }
      setDriverId(profile.profile.id);
      setMobilityUserId(profile.profile.user_id);
      await load(profile.profile.id);
    })();
    return () => {
      alive = false;
      loadRequestRef.current += 1;
    };
  }, [load, navigate]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && driverId && !adding && !busyContactId) {
        void load(driverId);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [adding, busyContactId, driverId, load]);

  async function addContact(): Promise<void> {
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    const cleanRelation = relation.trim();
    if (!driverId || adding || busyContactId) return;
    if (cleanName.length < 2) {
      setFormError("Informe o nome do contato.");
      return;
    }
    if (!isUsablePhone(cleanPhone)) {
      setFormError("Informe um telefone válido com DDD.");
      return;
    }

    setAdding(true);
    setFormError(null);
    try {
      const { error: rpcError } = await db.rpc("driver_add_emergency_contact", {
        _name: cleanName,
        _phone: cleanPhone,
        _relation: cleanRelation || null,
      });
      if (rpcError) throw rpcError;
      setName("");
      setPhone("");
      setRelation("");
      await load(driverId);
      toast.success("Contato de emergência adicionado.");
    } catch (caughtError: unknown) {
      console.error("[APOIS Motorista] add emergency contact failed", caughtError);
      setFormError("Não foi possível adicionar o contato agora.");
    } finally {
      setAdding(false);
    }
  }

  async function setPrimary(id: string): Promise<void> {
    if (!driverId || busyContactId || adding) return;
    setBusyContactId(id);
    try {
      const { error: rpcError } = await db.rpc("driver_set_emergency_contact_primary", {
        _contact_id: id,
      });
      if (rpcError) throw rpcError;
      await load(driverId);
      toast.success("Contato principal atualizado.");
    } catch (caughtError: unknown) {
      console.error("[APOIS Motorista] set primary emergency contact failed", caughtError);
      toast.error("Não foi possível definir o contato principal.");
    } finally {
      setBusyContactId(null);
    }
  }

  async function remove(id: string, contactName: string): Promise<void> {
    if (!driverId || busyContactId || adding) return;
    const confirmed = window.confirm(`Excluir ${contactName} dos seus contatos de emergência?`);
    if (!confirmed) return;

    setBusyContactId(id);
    try {
      const { error: rpcError } = await db.rpc("driver_delete_emergency_contact", {
        _contact_id: id,
      });
      if (rpcError) throw rpcError;
      await load(driverId);
      toast.success("Contato de emergência excluído.");
    } catch (caughtError: unknown) {
      console.error("[APOIS Motorista] delete emergency contact failed", caughtError);
      toast.error("Não foi possível excluir o contato.");
    } finally {
      setBusyContactId(null);
    }
  }

  async function triggerSOS(): Promise<void> {
    if (!driverId || !mobilityUserId || sosBusy) return;
    setSosBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (value) => resolve(value),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 15_000 },
        );
      });

      const lat = pos?.coords.latitude;
      const lng = pos?.coords.longitude;
      const hasValidPosition = typeof lat === "number" && typeof lng === "number" && validCoordinate(lat, lng);
      const { error: rpcError } = await db.rpc("create_driver_sos", {
        _lat: hasValidPosition ? lat : null,
        _lng: hasValidPosition ? lng : null,
        _severity: "critical",
        _message: "SOS acionado pelo motorista no aplicativo APOIS.",
      });
      if (rpcError) throw rpcError;
      toast.success("Alerta SOS registrado na Central APOIS.", {
        description: hasValidPosition ? "Sua localização atual foi incluída no alerta." : "O alerta foi enviado sem coordenadas de localização.",
      });
    } catch (caughtError: unknown) {
      console.error("[APOIS Motorista] SOS failed", caughtError);
      toast.error("Não foi possível registrar o alerta SOS agora.");
    } finally {
      setSosBusy(false);
    }
  }

  async function shareLocation(): Promise<void> {
    if (sharingLocation) return;
    if (!navigator.geolocation) {
      toast.error("Localização indisponível neste dispositivo.");
      return;
    }

    setSharingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 15_000,
        });
      });
      const { latitude, longitude } = position.coords;
      if (!validCoordinate(latitude, longitude)) throw new Error("invalid_location");
      const url = `https://maps.google.com/?q=${latitude},${longitude}`;

      if (navigator.share) {
        await navigator.share({
          title: "Minha localização — APOIS",
          text: "Estou aqui agora:",
          url,
        });
        return;
      }

      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(url);
      toast.success("Link da localização copiado.");
    } catch (caughtError: unknown) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      console.error("[APOIS Motorista] share location failed", caughtError);
      toast.error("Não foi possível compartilhar sua localização agora.");
    } finally {
      setSharingLocation(false);
    }
  }

  return (
    <div className="min-h-[100dvh] min-w-0 bg-[#050607] text-white">
      <MovviHeader logoutRedirect="/" />

      <main className="mx-auto w-full max-w-xl min-w-0 space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-5">
        <section className="min-w-0 rounded-[26px] border border-red-400/15 bg-[#0D0F11] p-4 sm:p-5" aria-labelledby="driver-security-title">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-400/10 text-red-400" aria-hidden="true">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-xs font-black uppercase tracking-[0.14em] text-[#F6BE1C]">Proteção APOIS</p>
              <h1 id="driver-security-title" className="mt-1 break-words text-xl font-black">Segurança</h1>
              <p className="mt-1 break-words text-sm font-medium leading-5 text-zinc-500">Ajuda rápida e contatos de emergência.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void triggerSOS()}
            disabled={sosBusy}
            aria-busy={sosBusy}
            className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-red-500 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
          >
            {sosBusy ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
            {sosBusy ? "Registrando SOS..." : "Acionar SOS"}
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2 max-[339px]:grid-cols-1">
            <a
              href="tel:190"
              aria-label="Ligar para a Polícia no número 190"
              className="flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-white/8 bg-[#111315] px-3 text-center text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"
            >
              <Phone className="h-4 w-4 shrink-0 text-[#F6BE1C]" aria-hidden="true" /> Polícia 190
            </a>
            <button
              type="button"
              onClick={() => void shareLocation()}
              disabled={sharingLocation}
              aria-busy={sharingLocation}
              className="flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-white/8 bg-[#111315] px-3 text-center text-sm font-black text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"
            >
              {sharingLocation ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none text-[#F6BE1C]" aria-hidden="true" /> : <Share2 className="h-4 w-4 shrink-0 text-[#F6BE1C]" aria-hidden="true" />}
              {sharingLocation ? "Preparando..." : "Compartilhar"}
            </button>
          </div>
        </section>

        <section className="min-w-0 rounded-[24px] border border-white/5 bg-[#0D0F11] p-4" aria-labelledby="emergency-contacts-title">
          <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-xs font-black uppercase tracking-[0.14em] text-[#F6BE1C]">Rede de apoio</p>
              <h2 id="emergency-contacts-title" className="mt-1 break-words text-base font-black">Contatos de emergência</h2>
            </div>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-black text-zinc-500" aria-label={`${contacts.length} ${contacts.length === 1 ? "contato cadastrado" : "contatos cadastrados"}`}>{contacts.length}</span>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4" role="alert" aria-live="assertive">
              <p className="break-words text-sm leading-5 text-red-200">{error}</p>
              {driverId ? <button type="button" onClick={() => void load(driverId)} disabled={loading} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300/20 px-4 text-sm font-bold text-red-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"><RefreshCw className={loading ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden="true" />Tentar novamente</button> : null}
            </div>
          ) : loading ? (
            <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-zinc-500" role="status" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none text-[#F6BE1C]" aria-hidden="true" />
              Carregando contatos...
            </div>
          ) : contacts.length === 0 ? (
            <p className="rounded-2xl border border-white/5 bg-[#111315] p-4 text-center text-sm font-medium leading-5 text-zinc-500" role="status">
              Nenhum contato cadastrado. Adicione alguém de confiança abaixo.
            </p>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => {
                const displayName = safeContactName(contact.name);
                const cleanPhone = normalizePhone(contact.phone);
                const callable = isUsablePhone(cleanPhone);
                const relationText = String(contact.relation ?? "").trim();
                const contactBusy = busyContactId === contact.id;
                return (
                  <article key={contact.id} className="min-w-0 rounded-[18px] border border-white/5 bg-[#111315] p-3" aria-busy={contactBusy}>
                    <div className="flex min-w-0 items-start gap-3 max-[339px]:flex-wrap">
                      <div className="min-w-[150px] flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="min-w-0 break-words text-sm font-black text-white [overflow-wrap:anywhere]">{displayName}</p>
                          {contact.is_primary ? <span className="inline-flex items-center gap-1 rounded-full bg-[#F6BE1C]/10 px-2 py-1 text-xs font-bold text-[#F6BE1C]"><Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />Principal</span> : null}
                        </div>
                        <p className="mt-1 break-words text-sm font-medium leading-5 text-zinc-500 [overflow-wrap:anywhere]">
                          {cleanPhone || "Telefone indisponível"}{relationText ? ` · ${relationText}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 max-[339px]:w-full max-[339px]:justify-end">
                        {callable ? <a href={`tel:${cleanPhone}`} aria-label={`Ligar para ${displayName}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F6BE1C]/10 text-[#F6BE1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"><Phone className="h-4 w-4" aria-hidden="true" /></a> : null}
                        {!contact.is_primary ? <button type="button" disabled={Boolean(busyContactId) || adding} onClick={() => void setPrimary(contact.id)} aria-label={`Definir ${displayName} como contato principal`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">{contactBusy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}</button> : null}
                        <button type="button" disabled={Boolean(busyContactId) || adding} onClick={() => void remove(contact.id, displayName)} aria-label={`Excluir ${displayName}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-400/8 text-red-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-[24px] border border-white/5 bg-[#0D0F11] p-4" aria-labelledby="add-emergency-contact-title">
          <h2 id="add-emergency-contact-title" className="break-words text-sm font-black uppercase tracking-[0.14em] text-[#F6BE1C]">Adicionar contato</h2>
          <div className="mt-3 space-y-3">
            <label className="block min-w-0"><span className="mb-1.5 block text-sm font-semibold text-zinc-300">Nome</span><input value={name} onChange={(event) => { setName(event.target.value.slice(0, 80)); setFormError(null); }} maxLength={80} autoComplete="name" disabled={adding} className="min-h-12 w-full min-w-0 rounded-[16px] border border-white/8 bg-[#111315] px-4 text-base font-semibold text-white outline-none placeholder:text-zinc-700 disabled:opacity-60 focus:border-[#F6BE1C]/50 focus-visible:ring-2 focus-visible:ring-[#F6BE1C]/30" placeholder="Nome do contato" /></label>
            <label className="block min-w-0"><span className="mb-1.5 block text-sm font-semibold text-zinc-300">Telefone com DDD</span><input value={phone} onChange={(event) => { setPhone(event.target.value.slice(0, 24)); setFormError(null); }} maxLength={24} placeholder="Ex.: (87) 99999-9999" inputMode="tel" autoComplete="tel" disabled={adding} aria-invalid={Boolean(formError && !isUsablePhone(normalizePhone(phone)))} className="min-h-12 w-full min-w-0 rounded-[16px] border border-white/8 bg-[#111315] px-4 text-base font-semibold text-white outline-none placeholder:text-zinc-700 disabled:opacity-60 focus:border-[#F6BE1C]/50 focus-visible:ring-2 focus-visible:ring-[#F6BE1C]/30" /></label>
            <label className="block min-w-0"><span className="mb-1.5 block text-sm font-semibold text-zinc-300">Parentesco ou relação <span className="font-normal text-zinc-600">(opcional)</span></span><input value={relation} onChange={(event) => setRelation(event.target.value.slice(0, 60))} maxLength={60} disabled={adding} placeholder="Ex.: mãe, marido, amiga" className="min-h-12 w-full min-w-0 rounded-[16px] border border-white/8 bg-[#111315] px-4 text-base font-semibold text-white outline-none placeholder:text-zinc-700 disabled:opacity-60 focus:border-[#F6BE1C]/50 focus-visible:ring-2 focus-visible:ring-[#F6BE1C]/30" /></label>
            {formError ? <p className="break-words rounded-xl border border-red-500/20 bg-red-500/8 p-3 text-sm leading-5 text-red-200" role="alert">{formError}</p> : null}
            <button type="button" onClick={() => void addContact()} disabled={!name.trim() || !phone.trim() || adding || Boolean(busyContactId)} aria-busy={adding} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#F6BE1C] px-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{adding ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}{adding ? "Adicionando..." : "Adicionar contato"}</button>
          </div>
        </section>
      </main>
    </div>
  );
}