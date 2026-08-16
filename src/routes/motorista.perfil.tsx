/**
 * APOIS — Profile screen.
 * Preserves uploads, personal-info edits, subscription, documents and auth flows.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Car,
  ChevronRight,
  CreditCard,
  Eye,
  FileText,
  LifeBuoy,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  User,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { DriverProfessionalProfileDialog } from "@/components/profile/DriverProfessionalProfileDialog";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { MovviHeader } from "@/components/MovviHeader";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";
import { toast } from "sonner";
import {
  Avatar,
  Body,
  BodySmall,
  Caption,
  DSButton,
  DSCard,
  HeadingL,
  HeadingS,
  Icon,
  Label,
  Metric,
  StatusPill,
} from "@/design-system";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/motorista/perfil")({
  head: () => ({ meta: [{ title: "Perfil do Motorista — APOIS" }] }),
  component: DriverProfilePage,
});

type Driver = {
  id?: string;
  user_id?: string;
  name: string | null;
  email: string | null;
  photo_url: string | null;
  category: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
  vehicle_year: number | null;
  rating: number | null;
  average_rating?: number | null;
  total_ratings?: number | null;
  completed_rides?: number | null;
  approval_status: string | null;
  documents_status?: string | null;
  subscription_status: string | null;
  subscription_expires_at?: string | null;
  city?: string | null;
  is_online: boolean | null;
  created_at: string | null;
};

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function safeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function safeRating(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(5, parsed) : 0;
}

function safeDateLabel(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", options);
}

function maskPlate(p: string | null | undefined) {
  const clean = cleanText(p).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 7);
  if (!clean) return "—";
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 3)}•${clean.slice(-2)}`;
}

function categoryLabel(value: string | null | undefined): string | null {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return null;
  const labels: Record<string, string> = {
    carros: "Carro",
    carro: "Carro",
    motos: "Moto",
    moto: "Moto",
    fretes: "Fretes e Mudanças",
    frete: "Fretes e Mudanças",
    guincho: "Guincho",
    envios: "Envios",
    envio: "Envios",
  };
  return labels[normalized] ?? "Categoria cadastrada";
}

function ratingLabel(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function DriverProfilePage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [totalRides, setTotalRides] = useState(0);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [mode, setMode] = useState<"hub" | "edit">("hub");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const requestRef = useRef(0);

  const loadProfile = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (requestId !== requestRef.current) return;
      if (authError || !auth.user) {
        setUserId(null);
        setDriver(null);
        await navigate({ to: "/motorista/login", replace: true });
        return;
      }

      setUserId(auth.user.id);
      const { data, error: profileError } = await (supabase as any).rpc("driver_get_profile");
      if (requestId !== requestRef.current) return;
      if (profileError) throw profileError;

      const nextDriver = (data ?? null) as Driver | null;
      if (!nextDriver) {
        setDriver(null);
        setTotalRides(0);
        setError("Seu perfil de motorista ainda não está disponível. Atualize a tela ou consulte o status do cadastro.");
        return;
      }

      setDriver(nextDriver);
      setTotalRides(safeCount(nextDriver.completed_rides));
    } catch (caughtError) {
      if (requestId !== requestRef.current) return;
      console.error("[APOIS DRIVER PROFILE] falha ao carregar perfil", caughtError);
      setError("Não foi possível carregar seu perfil agora. Tente novamente.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void loadProfile();
    return () => {
      requestRef.current += 1;
    };
  }, [loadProfile]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && mode === "hub" && !loggingOut) void loadProfile();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [loadProfile, loggingOut, mode]);

  if (mode === "edit") {
    return (
      <div className="relative min-h-dvh bg-background">
        <div className="fixed left-3 z-40" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}>
          <DSButton
            variant="outline"
            size="sm"
            onClick={() => setMode("hub")}
            className="min-h-11 rounded-full bg-card/95 px-4 backdrop-blur focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Voltar para o perfil"
          >
            <Icon as={ArrowLeft} size="sm" /> Voltar
          </DSButton>
        </div>
        <ProfileForm
          role="driver"
          title="Informações pessoais"
          description="Atualize seus dados de contato, segurança e emergência."
          onLoaded={({ userId: id }) => setUserId(id)}
        />
      </div>
    );
  }

  if (loading && !driver) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground" role="status" aria-live="polite">
        <div className="flex min-w-0 flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          <Body className="break-words font-semibold">Carregando seu perfil...</Body>
        </div>
      </div>
    );
  }

  const name = cleanText(driver?.name) || "Motorista APOIS";
  const rating = safeRating(driver?.average_rating ?? driver?.rating);
  const completed = safeCount(driver?.completed_rides ?? totalRides);
  const totalRatings = safeCount(driver?.total_ratings);
  const category = categoryLabel(driver?.category);
  const vehicleModel = cleanText(driver?.vehicle_model);
  const city = cleanText(driver?.city);
  const subStatus = cleanText(driver?.subscription_status).toLowerCase();
  const subActive = ["active", "ativa", "ativo", "paid", "pago", "teste"].includes(subStatus);
  const subTest = subStatus === "teste";
  const subPending = ["pending", "pendente", "processing", "processando"].includes(subStatus);
  const approval = cleanText(driver?.approval_status).toLowerCase();
  const approvalApproved = ["approved", "aprovado", "active", "ativo"].includes(approval);
  const approvalSuspended = ["suspenso", "suspended"].includes(approval);
  const approvalBlocked = ["bloqueado", "blocked"].includes(approval);
  const approvalLabel = approvalApproved
    ? "Conta ativa"
    : approvalSuspended
      ? "Conta suspensa"
      : approvalBlocked
        ? "Conta bloqueada"
        : "Conta pendente";
  const approvalPillStatus = approvalApproved ? "accepted" : approvalSuspended || approvalBlocked ? "cancelled" : "searching";
  const documentsStatus = cleanText(driver?.documents_status).toLowerCase();
  const documentsApproved = ["approved", "aprovado", "aprovados"].includes(documentsStatus);
  const documentsRejected = ["rejected", "reprovado", "reprovados"].includes(documentsStatus);
  const memberSince = safeDateLabel(driver?.created_at, { month: "long", year: "numeric" }) ?? "—";
  const expiresAt = safeDateLabel(driver?.subscription_expires_at) ?? null;
  const subscriptionLabel = subTest ? "Homologação ativa" : subActive ? "Mensalidade ativa" : subPending ? "Pagamento pendente" : "Mensalidade inativa";

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      toast.success("Sessão encerrada.");
      await navigate({ to: "/", replace: true });
    } catch (caughtError) {
      console.error("[APOIS DRIVER PROFILE] signOut failed", caughtError);
      toast.error("Não foi possível sair da conta agora. Tente novamente.");
    } finally {
      setLoggingOut(false);
    }
  }

  async function handlePhotoUploaded(result: { signedUrl: string; path: string }) {
    if (!userId) return;
    const signedUrl = result.signedUrl.trim();
    if (!signedUrl) {
      toast.error("A foto foi enviada, mas não pôde ser exibida agora. Atualize o perfil.");
      void loadProfile();
      return;
    }
    setDriver((current) => (current ? { ...current, photo_url: signedUrl } : current));
    toast.success("Foto atualizada!");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MovviHeader logoutRedirect="/" />

      <main
        className="flex-1 px-4 pt-4 sm:px-5"
        style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4">
          {error ? (
            <DSCard className="min-w-0 border-destructive/25 bg-destructive/5 p-4" role="alert" aria-live="assertive">
              <div className="flex min-w-0 items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <Body className="break-words font-semibold text-foreground">{error}</Body>
                  <DSButton variant="outline" size="sm" onClick={() => void loadProfile()} disabled={loading} className="mt-3 min-h-11 max-w-full focus-visible:ring-2 focus-visible:ring-primary" aria-busy={loading}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                    {loading ? "Atualizando..." : "Tentar novamente"}
                  </DSButton>
                </div>
              </div>
            </DSCard>
          ) : null}

          <DSCard className="relative min-w-0 overflow-hidden p-4 animate-fade-in motion-reduce:animate-none sm:p-6">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-primary/[0.06] blur-xl" />

            <div className="relative flex min-w-0 flex-col items-center gap-3 text-center">
              {userId ? (
                <div className="rounded-full p-1 ring-2 ring-primary/40 shadow-[0_10px_28px_-10px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]">
                  <ProfilePhotoUploader userId={userId} name={name} currentUrl={driver?.photo_url?.trim() || null} onUploaded={handlePhotoUploaded} size={96} label="" />
                </div>
              ) : (
                <Avatar name={name} size={96} />
              )}

              <HeadingL className="max-w-full break-words leading-tight [overflow-wrap:anywhere]">{name}</HeadingL>

              <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1 text-foreground" aria-label={rating > 0 ? `Avaliação ${ratingLabel(rating, 1)} de 5` : "Sem avaliações ainda"}>
                  <Star aria-hidden="true" className="h-4 w-4 shrink-0 fill-primary text-primary" />
                  <Body className="font-semibold">{ratingLabel(rating, 1)}</Body>
                  {totalRatings > 0 && <Caption>({totalRatings})</Caption>}
                </span>
                <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border" />
                <Caption className="break-words">{completed} {completed === 1 ? "corrida" : "corridas"}</Caption>
                {category && (
                  <>
                    <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border" />
                    <Caption className="max-w-full break-words">{category}</Caption>
                  </>
                )}
              </div>

              <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
                <StatusPill status={approvalPillStatus} label={approvalLabel} pulse={!approvalApproved && !approvalSuspended && !approvalBlocked} />
                <StatusPill status={subActive ? "accepted" : subPending ? "searching" : "cancelled"} label={subscriptionLabel} pulse={false} />
              </div>

              <DSButton
                variant="outline"
                size="sm"
                onClick={() => setPublicProfileOpen(true)}
                disabled={!userId}
                className="mt-1 min-h-11 max-w-full rounded-full px-4 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon as={Eye} size="sm" /> Ver perfil público
              </DSButton>
            </div>
          </DSCard>

          <section aria-label="Resumo do perfil" className="grid grid-cols-3 gap-2 animate-fade-in motion-reduce:animate-none sm:gap-3 max-[339px]:grid-cols-1">
            <StatCard label="Corridas" value={String(completed)} />
            <StatCard label="Avaliação" value={ratingLabel(rating, 1)} highlight />
            <StatCard label="Avaliações" value={String(totalRatings)} />
          </section>

          <DSCard className="min-w-0 p-4 animate-fade-in motion-reduce:animate-none sm:p-5">
            <HeadingS className="mb-3 break-words">Dados e veículo</HeadingS>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-[359px]:grid-cols-1">
              <InfoRow icon={Car} label="Veículo" value={vehicleModel || "—"} />
              <InfoRow label="Placa" value={maskPlate(driver?.vehicle_plate)} mono />
              <InfoRow icon={MapPin} label="Cidade" value={city || "—"} />
              <InfoRow icon={Calendar} label="Membro desde" value={memberSince} capitalize />
            </div>
          </DSCard>

          <Link to="/motorista/assinatura" className="block min-w-0 animate-fade-in motion-reduce:animate-none rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Abrir minha mensalidade">
            <DSCard className="press-scale flex min-w-0 items-center gap-3 p-4 max-[339px]:flex-wrap sm:p-5">
              <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", subActive ? "bg-primary/12 text-primary" : subPending ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")} aria-hidden="true">
                <Icon as={CreditCard} size="lg" />
              </span>
              <div className="min-w-[140px] flex-1 max-[339px]:min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Body className="break-words font-semibold">Mensalidade APOIS</Body>
                  <StatusPill status={subActive ? "accepted" : subPending ? "searching" : "cancelled"} label={subTest ? "Homologação" : subActive ? "Ativa" : subPending ? "Pendente" : "Inativa"} pulse={false} />
                </div>
                <Caption className="mt-0.5 block break-words">
                  {subTest ? "Acesso de homologação, sem cobrança" : subActive ? (expiresAt ? `Válida até ${expiresAt}` : "Mensalidade liberada") : subPending ? "Aguardando confirmação do pagamento" : "Regularize para receber corridas"}
                </Caption>
              </div>
              <Icon as={ChevronRight} size="md" className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </DSCard>
          </Link>

          <section className="flex min-w-0 flex-col gap-2 animate-fade-in motion-reduce:animate-none">
            <Label className="px-2">Conta</Label>
            <DSCard className="min-w-0 overflow-hidden p-0">
              <MenuRow icon={User} label="Informações pessoais" sub="Nome, e-mail, telefone e senha" onClick={() => setMode("edit")} />
              <Divider />
              <MenuRow icon={Car} label="Veículo e documentos" sub={vehicleModel ? `${vehicleModel} · ${maskPlate(driver?.vehicle_plate)}` : "Modelo, placa e documentos do veículo"} to="/motorista/documentos" />
              <Divider />
              <MenuRow
                icon={FileText}
                label="Documentos"
                sub="CNH, CRLV e selfie"
                to="/motorista/documentos"
                trailing={<StatusPill status={documentsApproved ? "accepted" : documentsRejected ? "cancelled" : "searching"} label={documentsApproved ? "Aprovados" : documentsRejected ? "Reenvio" : "Pendentes"} pulse={false} />}
              />
              <Divider />
              <MenuRow icon={CreditCard} label="Mensalidade" sub="Status, pagamento Pix e comprovante" to="/motorista/assinatura" />
              <Divider />
              <MenuRow icon={Sparkles} label="Regalias a bordo" sub="Escolha o que você oferece aos passageiros" to="/motorista/regalias" />
            </DSCard>
          </section>

          <section className="flex min-w-0 flex-col gap-2 animate-fade-in motion-reduce:animate-none">
            <Label className="px-2">Preferências</Label>
            <DSCard className="min-w-0 overflow-hidden p-0">
              <MenuRow icon={LifeBuoy} label="Suporte" sub="Central de ajuda e contato" to="/motorista/suporte" />
              <Divider />
              <MenuRow icon={ShieldCheck} label="Privacidade e segurança" sub="Dados, permissões e conta" to="/motorista/privacidade" />
            </DSCard>
          </section>

          <div className="flex flex-col gap-3 pt-1 animate-fade-in motion-reduce:animate-none">
            <DSButton variant="outline" size="lg" onClick={() => void handleLogout()} disabled={loggingOut} aria-busy={loggingOut} className="min-h-12 w-full text-destructive hover:bg-destructive/5 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive">
              {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Icon as={LogOut} size="md" />}
              {loggingOut ? "Saindo..." : "Sair da conta"}
            </DSButton>
            <BodySmall className="text-center text-muted-foreground">APOIS Motorista</BodySmall>
          </div>
        </div>
      </main>

      <DriverProfessionalProfileDialog open={publicProfileOpen} onOpenChange={setPublicProfileOpen} driverUserId={userId} />
      <ApoisDriverBottomNav />
    </div>
  );
}

function InfoRow({ icon, label, value, mono, capitalize }: { icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {icon && <Icon as={icon} size="sm" className="shrink-0 text-primary" />}
        <Caption className="break-words">{label}</Caption>
      </div>
      <Body className={cn("mt-0.5 break-words font-semibold text-foreground [overflow-wrap:anywhere]", mono && "font-mono tracking-wide", capitalize && "capitalize")}>{value}</Body>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <DSCard className={cn("flex min-w-0 flex-col items-center gap-2 p-3 text-center sm:p-4", highlight && "ring-1 ring-primary/25")}>
      <Metric className={cn("max-w-full break-words text-[clamp(18px,6vw,24px)] leading-none", highlight && "text-primary")}>{value}</Metric>
      <Label className="break-words text-center">{label}</Label>
    </DSCard>
  );
}

function MenuRow({ icon, label, sub, to, onClick, trailing }: { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; label: string; sub?: string; to?: string; onClick?: () => void; trailing?: React.ReactNode }) {
  const content = (
    <div className="flex min-h-[56px] min-w-0 items-center gap-3 px-4 py-3 transition active:bg-muted/40 max-[339px]:flex-wrap">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true"><Icon as={icon} size="md" /></span>
      <div className="min-w-[140px] flex-1 max-[339px]:min-w-0">
        <Body className="break-words font-semibold [overflow-wrap:anywhere]">{label}</Body>
        {sub && <Caption className="block break-words leading-4 [overflow-wrap:anywhere]">{sub}</Caption>}
      </div>
      {trailing ? <div className="max-w-full shrink-0 max-[339px]:ml-[55px]">{trailing}</div> : null}
      <Icon as={ChevronRight} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </div>
  );
  if (to) {
    return <Link to={to} className="block min-w-0 focus:outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">{content}</Link>;
  }
  return <button type="button" onClick={onClick} className="w-full min-w-0 text-left focus:outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">{content}</button>;
}

function Divider() {
  return <div aria-hidden="true" className="mx-4 h-px bg-border/60" />;
}
