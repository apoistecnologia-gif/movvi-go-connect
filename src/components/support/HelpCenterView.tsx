import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  LifeBuoy, AlertTriangle, Loader2, Send, FileText, ShieldCheck, HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  HELP_SECTIONS,
  PASSENGER_FAQ, DRIVER_FAQ,
  PASSENGER_CATEGORIES, DRIVER_CATEGORIES,
  type Faq, type SupportCategory,
} from "@/lib/support/helpCenter";
import { DSBadge, DSButton, DSCard, DSCardContent, DSCardDescription, DSCardHeader, DSCardTitle, DSInput, DSLabel, DSSelect, DSSelectContent, DSSelectItem, DSSelectTrigger, DSSelectValue, DSTextarea } from "@/design-system";

type Role = "passenger" | "driver";

type Ticket = {
  id: string;
  protocol: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
};

type RideOption = { id: string; label: string };

type PassengerSupportResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  ticket?: {
    id: string;
    protocol: string;
    status: string;
    createdAt: string;
  };
};

type Props = {
  role: Role;
  termsHref: string;
  privacyHref: string;
};

const PASSENGER_CATEGORY_MAP: Record<string, "ride" | "payment" | "account" | "safety" | "other"> = {
  ride_issue: "ride",
  driver_issue: "ride",
  payment: "payment",
  safety: "safety",
  account: "account",
  app_bug: "other",
  other: "other",
};

const TICKET_CATEGORY_LABELS: Record<string, string> = {
  ride: "Corrida",
  ride_issue: "Problema com corrida",
  driver_issue: "Problema com motorista",
  payment: "Pagamento",
  safety: "Segurança",
  account: "Conta",
  app_bug: "Erro no app",
  other: "Outro",
};

export function HelpCenterView({ role, termsHref, privacyHref }: Props) {
  const isDriver = role === "driver";
  const faq: Faq[] = isDriver ? DRIVER_FAQ : PASSENGER_FAQ;
  const categories: SupportCategory[] = isDriver ? DRIVER_CATEGORIES : PASSENGER_CATEGORIES;

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [domainUserId, setDomainUserId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(categories[0].value);
  const [rideId, setRideId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rides, setRides] = useState<RideOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  async function loadTickets(passengerId: string) {
    const { data, error } = await supabase
      .from("passenger_support_tickets")
      .select("id, protocol, subject, category, status, created_at")
      .eq("passenger_id", passengerId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[APOIS suporte] falha ao carregar tickets do passageiro", error);
      setTickets([]);
      return;
    }
    setTickets(data ?? []);
  }

  async function loadRecentRides(ownerId: string) {
    const column: "driver_id" | "passenger_id" = isDriver ? "driver_id" : "passenger_id";
    const { data, error } = await supabase
      .from("rides")
      .select("id, created_at, origin_name, destination_name")
      .eq(column, ownerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[APOIS suporte] falha ao carregar corridas recentes", error);
      setRides([]);
      return;
    }

    setRides(
      (data ?? []).map((r) => ({
        id: r.id,
        label: `${new Date(r.created_at).toLocaleDateString("pt-BR")} • ${(r.origin_name ?? "Origem").slice(0, 22)} → ${(r.destination_name ?? "Destino").slice(0, 22)}`,
      })),
    );
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setTickets([]);
      setRides([]);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const authUser = authData.user;
      if (!alive) return;

      if (authError || !authUser) {
        setAuthUserId(null);
        setDomainUserId(null);
        setDriverId(null);
        setLoading(false);
        return;
      }

      setAuthUserId(authUser.id);

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();

      if (!alive) return;
      if (profileError || !profile) {
        console.error("[APOIS suporte] perfil de domínio não encontrado", profileError);
        setDomainUserId(null);
        setDriverId(null);
        setLoading(false);
        return;
      }

      setDomainUserId(profile.id);

      if (isDriver) {
        const { data: driver, error: driverError } = await supabase
          .from("drivers")
          .select("id")
          .eq("user_id", profile.id)
          .maybeSingle();

        if (!alive) return;
        if (driverError || !driver) {
          console.error("[APOIS suporte] entidade de motorista não encontrada", driverError);
          setDriverId(null);
          setLoading(false);
          return;
        }

        setDriverId(driver.id);
        await loadRecentRides(driver.id);
      } else {
        setDriverId(null);
        await Promise.all([loadTickets(profile.id), loadRecentRides(profile.id)]);
      }

      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // load helpers intentionally use the current role snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!authUserId || !domainUserId) {
      toast.error("Faça login para enviar uma solicitação.");
      return;
    }
    if (isDriver && !driverId) {
      toast.error("Não foi possível identificar seu cadastro de motorista.");
      return;
    }
    if (subject.trim().length < 5 || message.trim().length < 10) {
      toast.error("Preencha assunto e mensagem com mais detalhes.");
      return;
    }

    setSending(true);
    try {
      if (isDriver) {
        const { error } = await supabase.from("form_submissions").insert({
          kind: "contact",
          consent: true,
          source: "apois-driver-app",
          status: "new",
          payload: {
            channel: "driver_support",
            auth_user_id: authUserId,
            domain_user_id: domainUserId,
            driver_id: driverId,
            subject: subject.trim(),
            category,
            message: message.trim(),
            ride_id: rideId || null,
          },
        });
        if (error) throw error;
        toast.success("Solicitação enviada ao suporte APOIS.");
      } else {
        const canonicalCategory = PASSENGER_CATEGORY_MAP[category] ?? "other";
        const { data, error } = await supabase.functions.invoke<PassengerSupportResponse>("passenger-support", {
          body: {
            category: canonicalCategory,
            subject: subject.trim(),
            message: message.trim(),
            rideId: rideId || undefined,
          },
        });

        if (error || !data?.ok) {
          throw new Error(data?.message || "Não foi possível registrar o atendimento.");
        }

        toast.success(
          data.ticket?.protocol
            ? `Atendimento aberto. Protocolo ${data.ticket.protocol}.`
            : "Atendimento aberto com sucesso.",
        );
        await loadTickets(domainUserId);
      }

      setSubject("");
      setMessage("");
      setRideId("");
      setCategory(categories[0].value);
    } catch (error) {
      console.error("[APOIS suporte] falha ao enviar solicitação", error);
      toast.error(error instanceof Error ? error.message : "Falha ao enviar solicitação.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl space-y-5">
      {!isDriver && (
        <header>
          <h1 className="text-2xl font-bold">Central de ajuda</h1>
          <p className="text-sm text-muted-foreground">
            Encontre respostas rápidas e envie uma solicitação ao suporte APOIS.
          </p>
        </header>
      )}

      <div className="grid grid-cols-1 gap-3">
        <QuickAction icon={AlertTriangle} label="Emergência — ligar 190" href="tel:190" danger />
      </div>

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

      <DSCard>
        <DSCardHeader>
          <DSCardTitle className="text-base">Falar com o suporte</DSCardTitle>
          <DSCardDescription>
            A solicitação fica registrada no backend da APOIS para análise da equipe.
          </DSCardDescription>
        </DSCardHeader>
        <DSCardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <DSLabel htmlFor="cat">Categoria</DSLabel>
              <DSSelect value={category} onValueChange={setCategory}>
                <DSSelectTrigger id="cat"><DSSelectValue /></DSSelectTrigger>
                <DSSelectContent>
                  {categories.map((c) => (
                    <DSSelectItem key={c.value} value={c.value}>{c.label}</DSSelectItem>
                  ))}
                </DSSelectContent>
              </DSSelect>
            </div>

            <div className="space-y-1.5">
              <DSLabel htmlFor="subj">Assunto</DSLabel>
              <DSInput id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumo do problema" maxLength={120} />
            </div>

            <div className="space-y-1.5">
              <DSLabel htmlFor="ride">Corrida relacionada (opcional)</DSLabel>
              <DSSelect value={rideId || "none"} onValueChange={(v) => setRideId(v === "none" ? "" : v)}>
                <DSSelectTrigger id="ride"><DSSelectValue placeholder="Nenhuma" /></DSSelectTrigger>
                <DSSelectContent>
                  <DSSelectItem value="none">Nenhuma</DSSelectItem>
                  {rides.map((r) => (
                    <DSSelectItem key={r.id} value={r.id}>{r.label}</DSSelectItem>
                  ))}
                </DSSelectContent>
              </DSSelect>
            </div>

            <div className="space-y-1.5">
              <DSLabel htmlFor="msg">Mensagem</DSLabel>
              <DSTextarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Descreva o ocorrido com detalhes" maxLength={2000} />
            </div>

            <DSButton type="submit" disabled={sending || loading} className="w-full">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar solicitação
            </DSButton>
          </form>
        </DSCardContent>
      </DSCard>

      {!isDriver && (
        <DSCard>
          <DSCardHeader>
            <DSCardTitle className="text-base">Meus atendimentos</DSCardTitle>
          </DSCardHeader>
          <DSCardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
              </div>
            ) : tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não abriu nenhum atendimento.</p>
            ) : (
              <ul className="space-y-2">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{t.subject}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.protocol} • {new Date(t.created_at).toLocaleString("pt-BR")} • {ticketCategoryLabel(t.category, categories)}
                      </div>
                    </div>
                    <DSBadge
                      variant={
                        t.status === "open" ? "primary" : t.status === "resolved" ? "success" : "muted"
                      }
                    >
                      {t.status === "open" ? "Aberto" : t.status === "resolved" ? "Resolvido" : t.status}
                    </DSBadge>
                  </li>
                ))}
              </ul>
            )}
          </DSCardContent>
        </DSCard>
      )}

      <DSCard className="border-border/60 bg-card/40">
        <DSCardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Documentos legais da APOIS
          </div>
          <div className="flex flex-wrap gap-2">
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

function ticketCategoryLabel(value: string, cats: SupportCategory[]) {
  return TICKET_CATEGORY_LABELS[value] ?? cats.find((c) => c.value === value)?.label ?? value;
}

function QuickAction({
  icon: Icon, label, href, danger,
}: { icon: LucideIcon; label: string; href: string; danger?: boolean }) {
  return (
    <a
      href={href}
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
