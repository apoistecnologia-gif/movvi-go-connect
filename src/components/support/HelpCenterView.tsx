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

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  resolved: "Resolvido",
  closed: "Encerrado",
  pending: "Em análise",
  in_progress: "Em atendimento",
  new: "Recebido",
};

function safeDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Data indisponível";
}

function safeDateOnly(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR") : "Data indisponível";
}

export function HelpCenterView({ role, termsHref, privacyHref }: Props) {
  const isDriver = role === "driver";
  const faq: Faq[] = isDriver ? DRIVER_FAQ : PASSENGER_FAQ;
  const categories: SupportCategory[] = isDriver ? DRIVER_CATEGORIES : PASSENGER_CATEGORIES;
  const defaultCategory = categories[0]?.value ?? "other";

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [domainUserId, setDomainUserId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [rideId, setRideId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rides, setRides] = useState<RideOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError("Não foi possível carregar seus atendimentos agora.");
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
        label: `${safeDateOnly(r.created_at)} • ${r.origin_name?.trim() || "Origem não informada"} → ${r.destination_name?.trim() || "Destino não informado"}`,
      })),
    );
  }

  useEffect(() => {
    setCategory(defaultCategory);
    setRideId("");
    setActiveSection(null);
  }, [defaultCategory, role]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setLoadError(null);
      setTickets([]);
      setRides([]);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const authUser = authData.user;
      if (!alive) return;

      if (authError || !authUser) {
        if (authError) console.error("[APOIS suporte] falha ao consultar sessão", authError);
        setAuthUserId(null);
        setDomainUserId(null);
        setDriverId(null);
        setLoadError("Entre na sua conta para abrir e acompanhar atendimentos.");
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
        setLoadError("Não foi possível carregar seu perfil para o suporte.");
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
          setLoadError("Não foi possível identificar seu cadastro de motorista para o suporte.");
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
    if (sending) return;
    if (!authUserId || !domainUserId) {
      toast.error("Faça login para enviar uma solicitação.");
      return;
    }
    if (isDriver && !driverId) {
      toast.error("Não foi possível identificar seu cadastro de motorista.");
      return;
    }

    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (cleanSubject.length < 5) {
      toast.error("Informe um assunto com pelo menos 5 caracteres.");
      return;
    }
    if (cleanMessage.length < 10) {
      toast.error("Descreva o ocorrido com pelo menos 10 caracteres.");
      return;
    }
    if (!categories.some((item) => item.value === category)) {
      toast.error("Selecione uma categoria válida.");
      return;
    }
    if (rideId && !rides.some((ride) => ride.id === rideId)) {
      toast.error("Selecione novamente a corrida relacionada.");
      setRideId("");
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
            subject: cleanSubject,
            category,
            message: cleanMessage,
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
            subject: cleanSubject,
            message: cleanMessage,
            rideId: rideId || undefined,
          },
        });

        if (error || !data?.ok) {
          console.error("[APOIS suporte] passenger-support rejeitou solicitação", error ?? data);
          throw new Error("support_submit_failed");
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
      setCategory(defaultCategory);
    } catch (error) {
      console.error("[APOIS suporte] falha ao enviar solicitação", error);
      toast.error("Não foi possível enviar sua solicitação agora. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="container mx-auto min-w-0 max-w-2xl space-y-5 overflow-x-hidden px-0.5">
      {!isDriver && (
        <header className="min-w-0">
          <h1 className="break-words text-2xl font-bold">Central de ajuda</h1>
          <p className="break-words text-sm leading-6 text-muted-foreground">
            Encontre respostas rápidas e envie uma solicitação ao suporte APOIS.
          </p>
        </header>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3">
        <QuickAction icon={AlertTriangle} label="Emergência — ligar 190" href="tel:190" danger />
      </div>

      {loadError ? (
        <DSCard className="min-w-0 border-amber-500/30 bg-amber-500/5" role="status" aria-live="polite">
          <DSCardContent className="pt-6">
            <p className="break-words text-sm leading-6 text-amber-200">{loadError}</p>
          </DSCardContent>
        </DSCard>
      ) : null}

      <DSCard className="min-w-0 border-border/60 bg-card/60">
        <DSCardHeader className="min-w-0">
          <DSCardTitle className="flex min-w-0 items-center gap-2 text-base">
            <HelpCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> <span className="min-w-0 break-words">Categorias de ajuda</span>
          </DSCardTitle>
          <DSCardDescription className="break-words">Escolha um tema para ver informações.</DSCardDescription>
        </DSCardHeader>
        <DSCardContent className="min-w-0">
          <div className="grid min-w-0 grid-cols-2 gap-2 max-[359px]:grid-cols-1 sm:grid-cols-3">
            {HELP_SECTIONS.map((s) => {
              const active = activeSection === s.id;
              const Icon = s.icon;
              const descriptionId = `help-section-${s.id}`;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={active}
                  aria-expanded={active}
                  aria-controls={descriptionId}
                  onClick={() => setActiveSection(active ? null : s.id)}
                  className={`group flex min-h-20 min-w-0 flex-col items-start justify-center gap-1.5 rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-background/40 hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} aria-hidden="true" />
                  <span className="min-w-0 break-words text-xs font-semibold leading-4">{s.title}</span>
                </button>
              );
            })}
          </div>
          {activeSection && (
            <div id={`help-section-${activeSection}`} role="region" aria-live="polite" className="mt-3 min-w-0 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
              {HELP_SECTIONS.find((s) => s.id === activeSection)?.description || "Informação indisponível para esta categoria."}
            </div>
          )}
        </DSCardContent>
      </DSCard>

      <DSCard className="min-w-0">
        <DSCardHeader className="min-w-0">
          <DSCardTitle className="flex min-w-0 items-center gap-2 text-base">
            <LifeBuoy className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> <span className="min-w-0 break-words">Perguntas frequentes</span>
          </DSCardTitle>
          <DSCardDescription className="break-words">Respostas para as dúvidas mais comuns.</DSCardDescription>
        </DSCardHeader>
        <DSCardContent className="min-w-0">
          <Accordion type="single" collapsible className="w-full min-w-0">
            {faq.map((item, i) => (
              <AccordionItem key={`${item.q}-${i}`} value={`q-${i}`} className="min-w-0">
                <AccordionTrigger className="min-h-11 min-w-0 py-3 text-left text-sm leading-5 [overflow-wrap:anywhere]">{item.q}</AccordionTrigger>
                <AccordionContent className="min-w-0 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </DSCardContent>
      </DSCard>

      <DSCard className="min-w-0">
        <DSCardHeader className="min-w-0">
          <DSCardTitle className="break-words text-base">Falar com o suporte</DSCardTitle>
          <DSCardDescription className="break-words leading-5">
            A solicitação fica registrada no backend da APOIS para análise da equipe.
          </DSCardDescription>
        </DSCardHeader>
        <DSCardContent className="min-w-0">
          <form onSubmit={handleSubmit} className="min-w-0 space-y-3" aria-busy={sending}>
            <div className="min-w-0 space-y-1.5">
              <DSLabel htmlFor="cat">Categoria</DSLabel>
              <DSSelect value={category} onValueChange={setCategory} disabled={sending || loading}>
                <DSSelectTrigger id="cat" className="min-h-11 min-w-0"><DSSelectValue /></DSSelectTrigger>
                <DSSelectContent>
                  {categories.map((c) => (
                    <DSSelectItem key={c.value} value={c.value}>{c.label}</DSSelectItem>
                  ))}
                </DSSelectContent>
              </DSSelect>
            </div>

            <div className="min-w-0 space-y-1.5">
              <DSLabel htmlFor="subj">Assunto</DSLabel>
              <DSInput id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumo do problema" maxLength={120} disabled={sending || loading} className="min-h-11 min-w-0 text-base" aria-describedby="subject-count" />
              <p id="subject-count" className="text-right text-[10px] text-muted-foreground" aria-live="polite">{subject.length}/120</p>
            </div>

            <div className="min-w-0 space-y-1.5">
              <DSLabel htmlFor="ride">Corrida relacionada (opcional)</DSLabel>
              <DSSelect value={rideId || "none"} onValueChange={(v) => setRideId(v === "none" ? "" : v)} disabled={sending || loading}>
                <DSSelectTrigger id="ride" className="min-h-11 min-w-0"><DSSelectValue placeholder="Nenhuma" /></DSSelectTrigger>
                <DSSelectContent>
                  <DSSelectItem value="none">Nenhuma</DSSelectItem>
                  {rides.map((r) => (
                    <DSSelectItem key={r.id} value={r.id} className="max-w-[calc(100vw-32px)] whitespace-normal [overflow-wrap:anywhere]">{r.label}</DSSelectItem>
                  ))}
                </DSSelectContent>
              </DSSelect>
            </div>

            <div className="min-w-0 space-y-1.5">
              <DSLabel htmlFor="msg">Mensagem</DSLabel>
              <DSTextarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Descreva o ocorrido com detalhes" maxLength={2000} disabled={sending || loading} className="min-w-0 text-base" aria-describedby="message-count" />
              <p id="message-count" className="text-right text-[10px] text-muted-foreground" aria-live="polite">{message.length}/2000</p>
            </div>

            <DSButton type="submit" disabled={sending || loading || !authUserId} aria-busy={sending} className="min-h-11 w-full min-w-0">
              {sending ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className="break-words">{sending ? "Enviando solicitação..." : "Enviar solicitação"}</span>
            </DSButton>
          </form>
        </DSCardContent>
      </DSCard>

      {!isDriver && (
        <DSCard className="min-w-0">
          <DSCardHeader className="min-w-0">
            <DSCardTitle className="break-words text-base">Meus atendimentos</DSCardTitle>
          </DSCardHeader>
          <DSCardContent className="min-w-0">
            {loading ? (
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> <span>Carregando...</span>
              </div>
            ) : tickets.length === 0 ? (
              <p className="break-words text-sm text-muted-foreground">Você ainda não abriu nenhum atendimento.</p>
            ) : (
              <ul className="min-w-0 space-y-2">
                {tickets.map((t) => {
                  const normalizedStatus = t.status?.trim().toLowerCase() || "pending";
                  return (
                    <li key={t.id} className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-3 max-[359px]:flex-col">
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm font-medium leading-5">{t.subject?.trim() || "Atendimento APOIS"}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                          {t.protocol?.trim() || "Protocolo indisponível"} • {safeDate(t.created_at)} • {ticketCategoryLabel(t.category, categories)}
                        </div>
                      </div>
                      <DSBadge
                        variant={
                          normalizedStatus === "open" ? "primary" : normalizedStatus === "resolved" ? "success" : "muted"
                        }
                        className="max-w-full shrink-0 whitespace-normal text-center"
                      >
                        {TICKET_STATUS_LABELS[normalizedStatus] ?? "Em análise"}
                      </DSBadge>
                    </li>
                  );
                })}
              </ul>
            )}
          </DSCardContent>
        </DSCard>
      )}

      <DSCard className="min-w-0 border-border/60 bg-card/40">
        <DSCardContent className="flex min-w-0 flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="break-words">Documentos legais da APOIS</span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 max-[359px]:grid max-[359px]:w-full max-[359px]:grid-cols-1">
            <DSButton asChild variant="outline" size="sm" className="min-h-11">
              <Link to={termsHref}><FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Termos</Link>
            </DSButton>
            <DSButton asChild variant="outline" size="sm" className="min-h-11">
              <Link to={privacyHref}><ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Privacidade</Link>
            </DSButton>
          </div>
        </DSCardContent>
      </DSCard>
    </div>
  );
}

function ticketCategoryLabel(value: string, cats: SupportCategory[]) {
  const normalized = value?.trim().toLowerCase() || "other";
  return TICKET_CATEGORY_LABELS[normalized] ?? cats.find((c) => c.value === normalized)?.label ?? "Outra categoria";
}

function QuickAction({
  icon: Icon, label, href, danger,
}: { icon: LucideIcon; label: string; href: string; danger?: boolean }) {
  return (
    <a
      href={href}
      className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        danger
          ? "border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10"
          : "border-border bg-card/50 hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="break-words text-xs font-medium leading-4">{label}</span>
    </a>
  );
}