import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Phone, Plus, Share2, ShieldAlert, Trash2 } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      role: "driver",
      lat: pos?.coords.latitude ?? null,
      lng: pos?.coords.longitude ?? null,
      status: "open",
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
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28">
        <div className="container mx-auto max-w-xl space-y-5">
          <header className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-destructive/15 text-destructive">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold">Segurança</h1>
              <p className="text-xs text-muted-foreground">Acione ajuda rápida e gerencie contatos de emergência.</p>
            </div>
          </header>

          <Card className="border-destructive/40">
            <CardContent className="space-y-3 p-4">
              <Button onClick={triggerSOS} variant="destructive" className="w-full" size="lg">
                <AlertTriangle className="mr-2 h-5 w-5" /> Acionar SOS
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline">
                  <a href="tel:190"><Phone className="mr-2 h-4 w-4" /> Polícia 190</a>
                </Button>
                <Button onClick={shareLocation} variant="outline">
                  <Share2 className="mr-2 h-4 w-4" /> Compartilhar local
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contatos de emergência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> Carregando...</p>
              ) : contacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum contato cadastrado.</p>
              ) : (
                <ul className="space-y-2">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {c.name} {c.is_primary && <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">PRINCIPAL</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{c.phone}{c.relation ? ` · ${c.relation}` : ""}</p>
                      </div>
                      <div className="flex gap-1">
                        <a href={`tel:${c.phone}`} className="rounded-md p-1.5 text-primary hover:bg-primary/10" aria-label="Ligar"><Phone className="h-4 w-4" /></a>
                        {!c.is_primary && (
                          <button onClick={() => setPrimary(c.id)} className="rounded-md px-2 text-[10px] text-foreground hover:bg-accent/40">Definir</button>
                        )}
                        <button onClick={() => remove(c.id)} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                <p className="text-xs font-semibold">Adicionar contato</p>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <Label className="text-[11px]">Nome</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Silva" />
                  </div>
                  <div>
                    <Label className="text-[11px]">Telefone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" inputMode="tel" />
                  </div>
                  <div>
                    <Label className="text-[11px]">Parentesco (opcional)</Label>
                    <Input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Esposa, irmão..." />
                  </div>
                  <Button onClick={addContact} disabled={!name || !phone || adding}>
                    {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Adicionar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}
