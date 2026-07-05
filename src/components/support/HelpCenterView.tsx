import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LifeBuoy, MessageSquare, Phone, AlertTriangle, Loader2, Send, MessagesSquare,
  Paperclip, FileText, ShieldCheck, HelpCircle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  HELP_SECTIONS,
  PASSENGER_FAQ, DRIVER_FAQ,
  PASSENGER_CATEGORIES, DRIVER_CATEGORIES,
  type Faq, type SupportCategory,
} from "@/lib/support/helpCenter";
import { DSButton, DSCard, DSCardContent, DSCardDescription, DSCardHeader, DSCardTitle, DSInput } from "@/design-system";

type Role = "passenger" | "driver";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
};

type RideOption = { id: string; label: string };

type Props = {
  role: Role;
  termsHref: string;
  privacyHref: string;
};

export function HelpCenterView({ role, termsHref, privacyHref }: Props) {
  const isDriver = role === "driver";
  const faq: Faq[] = isDriver ? DRIVER_FAQ : PASSENGER_FAQ;
  const categories: SupportCategory[] = isDriver ? DRIVER_CATEGORIES : PASSENGER_CATEGORIES;

  const [userId, setUserId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(categories[0].value);
  const [rideId, setRideId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rides, setRides] = useState<RideOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  async function loadTickets(uid: string) {
    const { data } = await supabase
      .from("support_tickets")
      .select("id, subject, category, status, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    setTickets(data ?? []);
  }

  async function loadRecentRides(uid: string) {
    const column = isDriver ? "driver_id" : "passenger_id";
    const { data } = await supabase
      .from("rides")
      .select("id, created_at, origin_name, destination_name")
      .eq(column, uid)
      .order("created_at", { ascending: false })
      .limit(10);
    setRides(
      (data ?? []).map((r) => ({
        id: r.id,
        label: `${new Date(r.created_at).toLocaleDateString("pt-BR")} • ${(r.origin_name ?? "Origem").slice(0, 22)} → ${(r.destination_name ?? "Destino").slice(0, 22)}`,
      })),
    );
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        await Promise.all([loadTickets(uid), loadRecentRides(uid)]);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      toast.error("Faça login para abrir um ticket.");
      return;
    }
    if (subject.trim().length < 3 || message.trim().length < 10) {
      toast.error("Preencha assunto e mensagem com mais detalhes.");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("support_tickets").insert({
      user_id: userId,
      user_type: role,
      subject: subject.trim(),
      category,
      description: message.trim(),
      ride_id: rideId || null,
      status: "open",
    });
    setSending(false);
    if (error) {
      toast.error("Falha ao enviar ticket.");
      return;
    }
    toast.success("Ticket enviado! Responderemos em breve.");
    setSubject("");
    setMessage("");
    setRideId("");
    setCategory(categories[0].value);
    await loadTickets(userId);
  }

  return (
    <div className="container mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Central de ajuda</h1>
        <p className="text-sm text-muted-foreground">
          Encontre respostas rápidas, abra um ticket ou fale com a MOVVI.
        </p>
      </header>

      {/* Quick channels */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction icon={MessagesSquare} label="WhatsApp" href="https://wa.me/5500000000000" />
        <QuickAction icon={Phone} label="Ligar" href="tel:+5500000000000" />
        <QuickAction icon={MessageSquare} label="E-mail" href="mailto:suporte@movvi.app" />
        <QuickAction icon={AlertTriangle} label="Emergência" href="tel:190" danger />
      </div>

      {/* Help center sections */}
      <DSCard className="border-border/60 bg-card/60">
        <DSCardHeader>
          <DSCardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-4 w-4 text-primary" /> Categorias de ajuda
          </DSCardTitle>
          <DSCardDescription>Escolha um tema para ver informações.</DSCardDescription>
        </DSCardHeader>
        <DSCardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {HELP_SECTIONS.map((s) => {
              const active = activeSection === s.id;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSection(active ? null : s.id)}
                  className={`group flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-background/40 hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                  <span className="text-xs font-semibold">{s.title}</span>
                </button>
              );
            })}
          </div>
          {activeSection && (
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
              {HELP_SECTIONS.find((s) => s.id === activeSection)?.description}
            </div>
          )}
        </DSCardContent>
      </DSCard>

      {/* FAQ */}
      <DSCard>
        <DSCardHeader>
          <DSCardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="h-4 w-4 text-primary" /> Perguntas frequentes
          </DSCardTitle>
          <DSCardDescription>Respostas para as dúvidas mais comuns.</DSCardDescription>
        </DSCardHeader>
        <DSCardContent>
          <Accordion type="single" collapsible className="w-full">
            {faq.map((item, i) => (
              <AccordionItem key={i} value={`q-${i}`}>
                <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </DSCardContent>
      </DSCard>

      {/* New ticket */}
      <DSCard>
        <DSCardHeader>
          <DSCardTitle className="text-base">Falar com o suporte</DSCardTitle>
          <DSCardDescription>Preencha o formulário. Respondemos em até 24h.</DSCardDescription>
        </DSCardHeader>
        <DSCardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subj">Assunto</Label>
              <DSInput id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumo do problema" maxLength={120} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ride">Corrida relacionada (opcional)</Label>
              <Select value={rideId || "none"} onValueChange={(v) => setRideId(v === "none" ? "" : v)}>
                <SelectTrigger id="ride"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {rides.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="msg">Mensagem</Label>
              <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Descreva o ocorrido com detalhes" maxLength={2000} />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              Anexos estarão disponíveis em breve.
            </div>

            <DSButton type="submit" disabled={sending} className="w-full">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar
            </DSButton>
          </form>
        </DSCardContent>
      </DSCard>

      {/* Previous tickets */}
      <DSCard>
        <DSCardHeader>
          <DSCardTitle className="text-base">Meus tickets</DSCardTitle>
        </DSCardHeader>
        <DSCardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Você ainda não abriu nenhum ticket.</p>
          ) : (
            <ul className="space-y-2">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.subject}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("pt-BR")} • {labelFor(t.category, categories)}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${t.status === "open"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : t.status === "resolved"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                        : "border-border text-muted-foreground"}`}
                  >
                    {t.status === "open" ? "Aberto" : t.status === "resolved" ? "Resolvido" : t.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DSCardContent>
      </DSCard>

      {/* Legal */}
      <DSCard className="border-border/60 bg-card/40">
        <DSCardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Documentos legais da MOVVI
          </div>
          <div className="flex gap-2">
            <DSButton asChild variant="outline" size="sm">
              <Link to={termsHref}><FileText className="mr-1.5 h-3.5 w-3.5" /> Termos</Link>
            </DSButton>
            <DSButton asChild variant="outline" size="sm">
              <Link to={privacyHref}><ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Privacidade</Link>
            </DSButton>
          </div>
        </DSCardContent>
      </DSCard>
    </div>
  );
}

function labelFor(value: string, cats: SupportCategory[]) {
  return cats.find((c) => c.value === value)?.label ?? value;
}

function QuickAction({
  icon: Icon, label, href, danger,
}: { icon: typeof MessagesSquare; label: string; href: string; danger?: boolean }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
        danger
          ? "border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
          : "border-border bg-card/50 hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-medium">{label}</span>
    </a>
  );
}
