import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { LifeBuoy, AlertTriangle, Loader2, Send, FileText, ShieldCheck, HelpCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { HELP_SECTIONS, PASSENGER_FAQ, DRIVER_FAQ, PASSENGER_CATEGORIES, DRIVER_CATEGORIES, type Faq, type SupportCategory } from "@/lib/support/helpCenter";
import { DSBadge, DSButton, DSCard, DSCardContent, DSCardDescription, DSCardHeader, DSCardTitle, DSInput, DSLabel, DSSelect, DSSelectContent, DSSelectItem, DSSelectTrigger, DSSelectValue, DSTextarea } from "@/design-system";

type Role = "passenger" | "driver";
type Ticket = { id: string; subject: string; category: string; status: string; created_at: string };
type RideOption = { id: string; label: string };
type Props = { role: Role; termsHref: string; privacyHref: string };

export function HelpCenterView({ role, termsHref, privacyHref }: Props) {
  const isDriver = role === "driver";
  const faq: Faq[] = isDriver ? DRIVER_FAQ : PASSENGER_FAQ;
  const categories: SupportCategory[] = isDriver ? DRIVER_CATEGORIES : PASSENGER_CATEGORIES;
  const [profileId, setProfileId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(categories[0]?.value ?? "general");
  const [rideId, setRideId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rides, setRides] = useState<RideOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  async function loadPassengerTickets(uid: string) {
    const { data, error } = await supabase.from("passenger_support_tickets")
      .select("id,subject,category,status,created_at")
      .eq("passenger_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    setTickets(data ?? []);
  }

  async function loadRecentRides(uid: string, resolvedDriverId: string | null) {
    const query = supabase.from("rides").select("id,created_at,origin_name,destination_name");
    const scoped = isDriver
      ? resolvedDriverId ? query.eq("driver_id", resolvedDriverId) : null
      : query.eq("passenger_id", uid);
    if (!scoped) { setRides([]); return; }
    const { data, error } = await scoped.order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    setRides((data ?? []).map((r) => ({
      id: r.id,
      label: `${new Date(r.created_at).toLocaleDateString("pt-BR")} • ${(r.origin_name ?? "Origem").slice(0, 22)} → ${(r.destination_name ?? "Destino").slice(0, 22)}`,
    })));
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) return;
        const { data: profile, error: profileError } = await supabase.from("users").select("id").eq("auth_user_id", auth.user.id).is("deleted_at", null).maybeSingle();
        if (profileError) throw profileError;
        if (!profile) return;
        let resolvedDriverId: string | null = null;
        if (isDriver) {
          const { data: driver, error: driverError } = await supabase.from("drivers").select("id").eq("user_id", profile.id).maybeSingle();
          if (driverError) throw driverError;
          resolvedDriverId = driver?.id ?? null;
        }
        if (!alive) return;
        setProfileId(profile.id); setDriverId(resolvedDriverId);
        await Promise.all([
          isDriver ? Promise.resolve(setTickets([])) : loadPassengerTickets(profile.id),
          loadRecentRides(profile.id, resolvedDriverId),
        ]);
      } catch (err) {
        if (alive) toast.error(err instanceof Error ? err.message : "Falha ao carregar suporte.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [isDriver, role]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isDriver) return;
    if (!profileId) { toast.error("Faça login para abrir um ticket."); return; }
    if (subject.trim().length < 3 || message.trim().length < 10) { toast.error("Preencha assunto e mensagem com mais detalhes."); return; }
    setSending(true);
    try {
      const protocol = `APOIS-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16).toUpperCase()}`;
      const { error } = await supabase.from("passenger_support_tickets").insert({
        protocol, passenger_id: profileId, subject: subject.trim(), category,
        message: message.trim(), ride_id: rideId || null, status: "open", priority: "normal",
      });
      if (error) throw error;
      toast.success(`Ticket ${protocol} enviado.`);
      setSubject(""); setMessage(""); setRideId(""); setCategory(categories[0]?.value ?? "general");
      await loadPassengerTickets(profileId);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Falha ao enviar ticket."); }
    finally { setSending(false); }
  }

  return <div className="container mx-auto max-w-2xl space-y-5">
    <header><h1 className="text-2xl font-bold">Central de ajuda</h1><p className="text-sm text-muted-foreground">Encontre respostas e canais reais de atendimento da APOIS.</p></header>
    <div className="grid gap-3 sm:grid-cols-2"><a href="tel:190" className="flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> Emergência — 190</a><DSCard className="p-3 text-sm text-muted-foreground">Contatos comerciais/suporte externos só serão exibidos quando houver canais oficiais configurados.</DSCard></div>

    <DSCard className="border-border/60 bg-card/60"><DSCardHeader><DSCardTitle className="flex items-center gap-2 text-base"><HelpCircle className="h-4 w-4 text-primary" /> Categorias de ajuda</DSCardTitle></DSCardHeader><DSCardContent><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{HELP_SECTIONS.map((s) => { const active=activeSection===s.id; const Icon=s.icon; return <button key={s.id} type="button" onClick={() => setActiveSection(active ? null : s.id)} className={`flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left ${active ? "border-primary bg-primary/10" : "border-border/60 bg-background/40"}`}><Icon className="h-4 w-4"/><span className="text-xs font-semibold">{s.title}</span></button>; })}</div>{activeSection && <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">{HELP_SECTIONS.find((s)=>s.id===activeSection)?.description}</div>}</DSCardContent></DSCard>

    <DSCard><DSCardHeader><DSCardTitle className="flex items-center gap-2 text-base"><LifeBuoy className="h-4 w-4 text-primary"/> Perguntas frequentes</DSCardTitle></DSCardHeader><DSCardContent><Accordion type="single" collapsible>{faq.map((item,i)=><AccordionItem key={i} value={`q-${i}`}><AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger><AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent></AccordionItem>)}</Accordion></DSCardContent></DSCard>

    {isDriver ? <DSCard><DSCardHeader><DSCardTitle className="text-base">Suporte do motorista</DSCardTitle><DSCardDescription>O schema oficial ainda não possui ticket persistente específico do motorista. Esta interface não simula envio: use o canal de emergência em risco imediato. O fluxo persistente será habilitado junto ao domínio de suporte canônico.</DSCardDescription></DSCardHeader></DSCard> : <DSCard><DSCardHeader><DSCardTitle className="text-base">Falar com o suporte</DSCardTitle><DSCardDescription>Abra um ticket persistido no backend APOIS.</DSCardDescription></DSCardHeader><DSCardContent><form onSubmit={handleSubmit} className="space-y-3"><div><DSLabel>Categoria</DSLabel><DSSelect value={category} onValueChange={setCategory}><DSSelectTrigger><DSSelectValue/></DSSelectTrigger><DSSelectContent>{categories.map(c=><DSSelectItem key={c.value} value={c.value}>{c.label}</DSSelectItem>)}</DSSelectContent></DSSelect></div><div><DSLabel>Assunto</DSLabel><DSInput value={subject} onChange={e=>setSubject(e.target.value)} maxLength={120}/></div><div><DSLabel>Corrida relacionada</DSLabel><DSSelect value={rideId||"none"} onValueChange={v=>setRideId(v==="none"?"":v)}><DSSelectTrigger><DSSelectValue placeholder="Nenhuma"/></DSSelectTrigger><DSSelectContent><DSSelectItem value="none">Nenhuma</DSSelectItem>{rides.map(r=><DSSelectItem key={r.id} value={r.id}>{r.label}</DSSelectItem>)}</DSSelectContent></DSSelect></div><div><DSLabel>Mensagem</DSLabel><DSTextarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} maxLength={2000}/></div><DSButton type="submit" disabled={sending} className="w-full">{sending?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Send className="mr-2 h-4 w-4"/>}Enviar</DSButton></form></DSCardContent></DSCard>}

    {!isDriver && <DSCard><DSCardHeader><DSCardTitle className="text-base">Meus tickets</DSCardTitle></DSCardHeader><DSCardContent>{loading?<Loader2 className="h-4 w-4 animate-spin"/>:tickets.length===0?<p className="text-sm text-muted-foreground">Você ainda não abriu nenhum ticket.</p>:<ul className="space-y-2">{tickets.map(t=><li key={t.id} className="flex justify-between rounded-lg border p-3"><div><div className="text-sm font-medium">{t.subject}</div><div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")} • {labelFor(t.category,categories)}</div></div><DSBadge variant={t.status==="open"?"primary":"muted"}>{t.status}</DSBadge></li>)}</ul>}</DSCardContent></DSCard>}

    <DSCard><DSCardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:justify-between"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary"/>Documentos legais APOIS</div><div className="flex gap-2"><DSButton asChild variant="outline" size="sm"><Link to={termsHref}><FileText className="mr-1 h-3.5 w-3.5"/>Termos</Link></DSButton><DSButton asChild variant="outline" size="sm"><Link to={privacyHref}><ShieldCheck className="mr-1 h-3.5 w-3.5"/>Privacidade</Link></DSButton></div></DSCardContent></DSCard>
    {isDriver && driverId === null && !loading ? <p className="text-xs text-muted-foreground">Cadastro de motorista não encontrado para esta sessão.</p> : null}
  </div>;
}

function labelFor(value: string, cats: SupportCategory[]) { return cats.find(c=>c.value===value)?.label ?? value; }
