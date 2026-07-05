import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Phone, Plus, Share2, ShieldAlert, Trash2 } from "lucide-react";
import { SettingsPageShell, SettingsHero, SettingsSection } from "@/components/settings";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DSButton, DSInput } from "@/design-system";

export const Route = createFileRoute("/motorista/seguranca")({
  head: () => ({ meta: [{ title: "Segurança — MOVVI DRIVE" }] }),
  component: DriverSecurityPage,
});

type Contact = { id: string; name: string; phone: string; relation: string | null; is_primary: boolean };

function DriverSecurityPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [adding, setAdding] = useState(false);

  async function load(uid: string) {
    const { data } = await supabase
      .from("driver_emergency_contacts")
      .select("id,name,phone,relation,is_primary")
      .eq("driver_user_id", uid)
      .order("is_primary", { ascending: false });
    setContacts((data ?? []) as Contact[]);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.auth.getUser();
      if (!a?.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(a.user.id);
      await load(a.user.id);
    })();
  }, [navigate]);

  async function addContact() {
    if (!userId || !name || !phone) return;
    setAdding(true);
    const { error } = await supabase.from("driver_emergency_contacts").insert({
      driver_user_id: userId, name, phone, relation: relation || null,
      is_primary: contacts.length === 0,
    });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setName(""); setPhone(""); setRelation("");
    await load(userId);
    toast.success("Contato adicionado!");
  }

  async function setPrimary(id: string) {
    if (!userId) return;
    await supabase.from("driver_emergency_contacts").update({ is_primary: false }).eq("driver_user_id", userId);
    await supabase.from("driver_emergency_contacts").update({ is_primary: true }).eq("id", id);
    await load(userId);
  }

  async function remove(id: string) {
    await supabase.from("driver_emergency_contacts").delete().eq("id", id);
    if (userId) await load(userId);
  }

  async function triggerSOS() {
    if (!userId) return;
    const pos = await new Promise<GeolocationPosition | null>((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res(p), () => res(null), { enableHighAccuracy: true, timeout: 5000 });
    });
    const { error } = await supabase.from("sos_alerts").insert({
      user_id: userId,
      lat: pos?.coords.latitude ?? null,
      lng: pos?.coords.longitude ?? null,
      message: "SOS acionado pelo motorista",
    });
    if (error) toast.error(error.message);
    else toast.success("Alerta SOS enviado para o suporte MOVVI.");
  }

  function shareLocation() {
    if (!navigator.geolocation) { toast.error("GPS indisponível."); return; }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const url = `https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`;
        if (navigator.share) {
          await navigator.share({ title: "Minha localização — MOVVI", text: "Estou aqui agora:", url });
        } else {
          await navigator.clipboard.writeText(url);
          toast.success("Link da localização copiado!");
        }
      },
      () => toast.error("Não foi possível obter sua localização."),
    );
  }

  return (
    <SettingsPageShell>
      <SettingsHero
        icon={ShieldAlert}
        title="Segurança"
        subtitle="Acione ajuda rápida e gerencie contatos de emergência."
        tone="danger"
      />

      <section className="rounded-[24px] bg-white p-5 shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 space-y-3">
        <DSButton onClick={triggerSOS} variant="destructive" className="w-full" size="lg">
          <AlertTriangle className="mr-2 h-5 w-5" /> Acionar SOS
        </DSButton>
        <div className="grid grid-cols-2 gap-2">
          <DSButton asChild variant="outline">
            <a href="tel:190"><Phone className="mr-2 h-4 w-4" /> Polícia 190</a>
          </DSButton>
          <DSButton onClick={shareLocation} variant="outline">
            <Share2 className="mr-2 h-4 w-4" /> Compartilhar
          </DSButton>
        </div>
      </section>

      <SettingsSection title="Contatos de emergência">
        {loading ? (
          <div className="px-4 py-4 text-[12.5px] text-[#707070]">
            <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Carregando...
          </div>
        ) : contacts.length === 0 ? (
          <div className="px-4 py-4 text-[12.5px] text-[#707070]">Nenhum contato cadastrado.</div>
        ) : (
          contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[#1B1B1B]">
                  {c.name}
                  {c.is_primary && (
                    <span className="ml-2 rounded-full bg-[#76C139]/15 px-2 py-0.5 text-[10px] font-semibold text-[#3F7A17] ring-1 ring-[#76C139]/25">
                      PRINCIPAL
                    </span>
                  )}
                </p>
                <p className="text-[12.5px] text-[#707070]">
                  {c.phone}{c.relation ? ` · ${c.relation}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <a
                  href={`tel:${c.phone}`}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[#5A9A2A] hover:bg-[#76C139]/10"
                  aria-label="Ligar"
                >
                  <Phone className="h-4 w-4" />
                </a>
                {!c.is_primary && (
                  <button
                    onClick={() => setPrimary(c.id)}
                    className="rounded-xl px-2.5 py-1 text-[11px] font-semibold text-[#1B1B1B] hover:bg-[#F7F9F7]"
                  >
                    Definir
                  </button>
                )}
                <button
                  onClick={() => remove(c.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[#DC2626] hover:bg-[#FEE2E2]"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </SettingsSection>

      <SettingsSection title="Adicionar contato">
        <div className="space-y-3 p-4">
          <div>
            <Label className="text-[12px] text-[#707070]">Nome</Label>
            <DSInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Silva" />
          </div>
          <div>
            <Label className="text-[12px] text-[#707070]">Telefone</Label>
            <DSInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" />
          </div>
          <div>
            <Label className="text-[12px] text-[#707070]">Parentesco (opcional)</Label>
            <DSInput value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Esposa, irmão..." />
          </div>
          <DSButton onClick={addContact} disabled={!name || !phone || adding} className="w-full">
            {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Adicionar
          </DSButton>
        </div>
      </SettingsSection>
    </SettingsPageShell>
  );
}
