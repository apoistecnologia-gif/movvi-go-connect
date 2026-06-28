import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  LifeBuoy, MessageSquare, Phone, AlertTriangle, Loader2, Send, MessagesSquare,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/passageiro/suporte")({
  head: () => ({ meta: [{ title: "Suporte — MOVVI DRIVE" }] }),
  component: SuportePassageiro,
});

const FAQ = [
  { q: "Como solicito uma corrida?", a: "Na tela inicial, defina origem e destino e toque em Solicitar corrida. O sistema busca motoristas próximos automaticamente." },
  { q: "Como funciona o código de segurança (PIN)?", a: "Ao aceitar a corrida, o app gera um PIN de 4 dígitos. Informe-o ao motorista para que ele possa iniciar a viagem — isso garante que você embarcou no carro certo." },
  { q: "Como avalio o motorista?", a: "Ao finalizar a corrida, abra a tela de avaliação, dê de 1 a 5 estrelas e, se quiser, deixe um comentário. A avaliação pode ser feita apenas uma vez por corrida." },
  { q: "Esqueci um objeto no carro. E agora?", a: "Abra um ticket em 'Objeto perdido' informando data, motorista (se lembrar) e descrição do item. Nossa equipe entrará em contato com o motorista." },
  { q: "Posso cancelar uma corrida?", a: "Sim — antes do motorista chegar. Cancelamentos após o início podem gerar cobrança simbólica conforme política da MOVVI." },
  { q: "Como reporto um problema com o motorista?", a: "Na tela de avaliação, toque em 'Denunciar motorista' e descreva o ocorrido. Casos graves são analisados em até 24h." },
];

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
};

function SuportePassageiro() {
  const [userId, setUserId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTickets(uid: string) {
    const { data } = await supabase
      .from("support_tickets")
      .select("id, subject, category, status, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    setTickets(data ?? []);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) await loadTickets(uid);
      setLoading(false);
    })();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      toast.error("Faça login para abrir um ticket.");
      return;
    }
    if (subject.trim().length < 3 || description.trim().length < 10) {
      toast.error("Preencha assunto e descrição com mais detalhes.");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("support_tickets").insert({
      user_id: userId,
      subject: subject.trim(),
      category,
      description: description.trim(),
      status: "open",
    });
    setSending(false);
    if (error) {
      toast.error("Falha ao enviar ticket.");
      return;
    }
    toast.success("Ticket enviado! Responderemos por e-mail.");
    setSubject("");
    setDescription("");
    setCategory("general");
    await loadTickets(userId);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-24">
        <div className="container mx-auto max-w-2xl space-y-5">
          <header>
            <h1 className="text-2xl font-bold">Central de ajuda</h1>
            <p className="text-sm text-muted-foreground">
              Tire dúvidas, abra um ticket ou fale com a gente.
            </p>
          </header>

          {/* Canais rápidos */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction icon={MessagesSquare} label="WhatsApp" href="https://wa.me/5500000000000" />
            <QuickAction icon={Phone} label="Ligar" href="tel:+5500000000000" />
            <QuickAction icon={MessageSquare} label="E-mail" href="mailto:suporte@movvi.app" />
            <QuickAction icon={AlertTriangle} label="Emergência" href="tel:190" danger />
          </div>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LifeBuoy className="h-4 w-4 text-primary" /> Perguntas frequentes
              </CardTitle>
              <CardDescription>Respostas para as dúvidas mais comuns.</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {FAQ.map((item, i) => (
                  <AccordionItem key={i} value={`q-${i}`}>
                    <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {/* Novo ticket */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Abrir um ticket</CardTitle>
              <CardDescription>Conte o que aconteceu. Respondemos em até 24h.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cat">Categoria</Label>
                  <select
                    id="cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="general">Dúvida geral</option>
                    <option value="ride_issue">Problema com corrida</option>
                    <option value="lost_item">Objeto perdido</option>
                    <option value="payment">Pagamento</option>
                    <option value="account">Conta e cadastro</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subj">Assunto</Label>
                  <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumo do problema" maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="desc">Descrição</Label>
                  <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Conte com detalhes o que aconteceu" maxLength={2000} />
                </div>
                <Button type="submit" disabled={sending} className="w-full">
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Enviar ticket
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Tickets anteriores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meus tickets</CardTitle>
            </CardHeader>
            <CardContent>
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
                          {new Date(t.created_at).toLocaleString("pt-BR")} • {t.category}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.status === "open"
                            ? "bg-primary/15 text-primary"
                            : t.status === "resolved"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.status === "open" ? "Aberto" : t.status === "resolved" ? "Resolvido" : t.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <BottomNav items={PASSENGER_NAV} />
    </div>
  );
}

function QuickAction({
  icon: Icon, label, href, danger,
}: { icon: React.ComponentType<{ className?: string }>; label: string; href: string; danger?: boolean }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition ${
        danger
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-border bg-card/60 text-foreground hover:bg-accent/40"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </a>
  );
}
