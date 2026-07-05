/**
 * MOVVI DRIVER — Profile screen (UI redesign only — Design System pass).
 * Preserves all logic: uploads, personal-info edits, subscription, documents, auth.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Car,
  ChevronRight,
  CreditCard,
  Eye,
  FileText,
  LifeBuoy,
  LogOut,
  MapPin,
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
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
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
  head: () => ({ meta: [{ title: "Perfil do Motorista — MOVVI DRIVE" }] }),
  component: DriverProfilePage,
});

type Driver = {
  id?: string;
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
  subscription_status: string | null;
  subscription_expires_at?: string | null;
  city?: string | null;
  is_online: boolean | null;
  created_at: string | null;
};

function maskPlate(p: string | null | undefined) {
  if (!p) return "—";
  const clean = p.replace(/\s/g, "").toUpperCase();
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 3)}•${clean.slice(-2)}`;
}

function DriverProfilePage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [totalRides, setTotalRides] = useState(0);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [mode, setMode] = useState<"hub" | "edit">("hub");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      if (!alive) return;
      setUserId(u.user.id);

      const { data: d } = await supabase
        .from("drivers")
        .select(
          "id,name,email,photo_url,category,vehicle_model,vehicle_color,vehicle_plate,vehicle_year,rating,average_rating,total_ratings,completed_rides,approval_status,subscription_status,subscription_expires_at,city,is_online,created_at",
        )
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!alive) return;
      setDriver((d ?? null) as Driver | null);

      const { count } = await supabase
        .from("rides")
        .select("id", { count: "exact", head: true })
        .eq("driver_id", u.user.id)
        .eq("status", "finalizada");
      if (!alive) return;
      setTotalRides(count ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (mode === "edit") {
    return (
      <div className="relative min-h-dvh bg-background">
        <div className="fixed left-3 top-16 z-40">
          <DSButton
            variant="outline"
            size="sm"
            onClick={() => setMode("hub")}
            className="rounded-full bg-card/95 backdrop-blur"
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

  const name = driver?.name || "Motorista MOVVI";
  const rating = Number(driver?.average_rating ?? driver?.rating ?? 0);
  const completed = Number(driver?.completed_rides ?? totalRides);
  const totalRatings = Number(driver?.total_ratings ?? 0);
  const subStatus = (driver?.subscription_status ?? "").toLowerCase();
  const subActive = subStatus === "active" || subStatus === "ativa";
  const approval = (driver?.approval_status ?? "").toLowerCase();
  const approvalApproved =
    approval === "approved" || approval === "aprovado" || approval === "active";
  const memberSince = driver?.created_at
    ? new Date(driver.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : "—";
  const expiresAt = driver?.subscription_expires_at
    ? new Date(driver.subscription_expires_at).toLocaleDateString("pt-BR")
    : null;

  async function handleLogout() {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    navigate({ to: "/" });
  }

  async function handlePhotoUploaded(result: { signedUrl: string; path: string }) {
    if (!userId) return;
    setDriver((d) => (d ? { ...d, photo_url: result.signedUrl } : d));
    try {
      await supabase
        .from("users")
        .update({ avatar_url: result.signedUrl })
        .eq("auth_user_id", userId);
      await supabase.from("drivers").update({ photo_url: result.signedUrl }).eq("user_id", userId);
      await supabase.auth.updateUser({ data: { avatar_url: result.signedUrl } });
      toast.success("Foto atualizada!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar a foto.");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MovviHeader logoutRedirect="/" />

      <main
        className="flex-1 px-4 pt-4 sm:px-5"
        style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {/* ============ HERO ============ */}
          <DSCard className="relative overflow-hidden p-5 sm:p-6 animate-fade-in">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-primary/[0.06] blur-xl"
            />

            <div className="relative flex flex-col items-center gap-3 text-center">
              {userId ? (
                <div className="rounded-full p-1 ring-2 ring-primary/40 shadow-[0_10px_28px_-10px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]">
                  <ProfilePhotoUploader
                    userId={userId}
                    name={name}
                    currentUrl={driver?.photo_url ?? null}
                    onUploaded={handlePhotoUploaded}
                    size={96}
                    label=""
                  />
                </div>
              ) : (
                <Avatar name={name} size={96} />
              )}

              <HeadingL className="max-w-full truncate">{name}</HeadingL>

              {/* Rating + trips inline metric (not a badge) */}
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <Star aria-hidden="true" className="h-4 w-4 fill-primary text-primary" />
                  <Body className="font-semibold">{rating > 0 ? rating.toFixed(2) : "—"}</Body>
                  {totalRatings > 0 && <Caption>({totalRatings})</Caption>}
                </span>
                <span aria-hidden="true" className="h-3 w-px bg-border" />
                <Caption>{completed} viagens</Caption>
                {driver?.category && (
                  <>
                    <span aria-hidden="true" className="h-3 w-px bg-border" />
                    <Caption className="capitalize">{driver.category}</Caption>
                  </>
                )}
              </div>

              {/* Status pills */}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <StatusPill
                  status={approvalApproved ? "accepted" : "searching"}
                  label={approvalApproved ? "Conta ativa" : "Conta pendente"}
                  pulse={!approvalApproved}
                />
                <StatusPill
                  status={subActive ? "accepted" : "cancelled"}
                  label={subActive ? "Premium ativa" : "Premium inativa"}
                  pulse={false}
                />
              </div>

              <DSButton
                variant="outline"
                size="sm"
                onClick={() => setPublicProfileOpen(true)}
                className="mt-1 rounded-full"
              >
                <Icon as={Eye} size="sm" /> Ver perfil público
              </DSButton>
            </div>
          </DSCard>

          {/* ============ STATISTICS ============ */}
          <section
            aria-label="Resumo do perfil"
            className="grid grid-cols-3 gap-2 sm:gap-3 animate-fade-in"
          >
            <StatCard label="Corridas" value={String(completed)} />
            <StatCard label="Avaliação" value={rating > 0 ? rating.toFixed(1) : "—"} highlight />
            <StatCard label="Avaliações" value={String(totalRatings)} />
          </section>

          {/* ============ VEHICLE / PERSONAL INFO ============ */}
          <DSCard className="p-4 sm:p-5 animate-fade-in">
            <HeadingS className="mb-3">Dados & veículo</HeadingS>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <InfoRow icon={Car} label="Veículo" value={driver?.vehicle_model || "—"} />
              <InfoRow label="Placa" value={maskPlate(driver?.vehicle_plate)} mono />
              <InfoRow icon={MapPin} label="Cidade" value={driver?.city || "—"} />
              <InfoRow icon={Calendar} label="Membro desde" value={memberSince} capitalize />
            </div>
          </DSCard>

          {/* ============ SUBSCRIPTION CTA ============ */}
          <Link
            to="/motorista/assinatura"
            className="block animate-fade-in focus:outline-none"
            aria-label="Abrir minha assinatura"
          >
            <DSCard className="press-scale flex items-center gap-3 p-4 sm:p-5">
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                  subActive ? "bg-primary/12 text-primary" : "bg-destructive/10 text-destructive",
                )}
              >
                <Icon as={CreditCard} size="lg" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Body className="font-semibold">MOVVI Premium</Body>
                  <StatusPill
                    status={subActive ? "accepted" : "cancelled"}
                    label={subActive ? "Ativa" : "Vencida"}
                    pulse={subActive}
                  />
                </div>
                <Caption className="mt-0.5 block">
                  {subActive
                    ? expiresAt
                      ? `Renova em ${expiresAt}`
                      : "Todos os benefícios liberados"
                    : "Ative para receber corridas"}
                </Caption>
              </div>
              <Icon as={ChevronRight} size="md" className="text-muted-foreground" />
            </DSCard>
          </Link>

          {/* ============ ACCOUNT SECTIONS ============ */}
          <section className="flex flex-col gap-2 animate-fade-in">
            <Label className="px-2">Conta</Label>
            <DSCard className="overflow-hidden p-0">
              <MenuRow
                icon={User}
                label="Informações pessoais"
                sub="Nome, e-mail, telefone e senha"
                onClick={() => setMode("edit")}
              />
              <Divider />
              <MenuRow
                icon={Car}
                label="Veículo"
                sub={
                  driver?.vehicle_model
                    ? `${driver.vehicle_model} · ${maskPlate(driver?.vehicle_plate)}`
                    : "Modelo, placa e categoria"
                }
                to="/motorista/documentos"
              />
              <Divider />
              <MenuRow
                icon={FileText}
                label="Documentos"
                sub="CNH, CRLV e selfie"
                to="/motorista/documentos"
                trailing={
                  <StatusPill
                    status={approvalApproved ? "accepted" : "searching"}
                    label={approvalApproved ? "Aprovados" : "Pendentes"}
                    pulse={false}
                  />
                }
              />
              <Divider />
              <MenuRow
                icon={CreditCard}
                label="Pagamentos e assinatura"
                sub="Formas de pagamento e recibos"
                to="/motorista/assinatura"
              />
              <Divider />
              <MenuRow
                icon={Sparkles}
                label="Regalias a bordo"
                sub="Escolha o que você oferece aos passageiros"
                to="/motorista/regalias"
              />
            </DSCard>

          </section>

          <section className="flex flex-col gap-2 animate-fade-in">
            <Label className="px-2">Preferências</Label>
            <DSCard className="overflow-hidden p-0">
              <MenuRow
                icon={LifeBuoy}
                label="Suporte"
                sub="Central de ajuda e contato"
                to="/motorista/suporte"
              />
              <Divider />
              <MenuRow
                icon={ShieldCheck}
                label="Privacidade e segurança"
                sub="Dados, permissões e conta"
                to="/motorista/privacidade"
              />
            </DSCard>
          </section>

          {/* ============ LOGOUT ============ */}
          <div className="flex flex-col gap-3 pt-1 animate-fade-in">
            <DSButton
              variant="outline"
              size="lg"
              onClick={handleLogout}
              className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              <Icon as={LogOut} size="md" /> Sair da conta
            </DSButton>
            <BodySmall className="text-center text-muted-foreground">
              MOVVI Driver · Versão 1.0
            </BodySmall>
          </div>
        </div>
      </main>

      <DriverProfessionalProfileDialog
        open={publicProfileOpen}
        onOpenChange={setPublicProfileOpen}
        driverUserId={userId}
      />

      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}

/* ---------- subcomponents (DS-only) ---------- */

function InfoRow({
  icon,
  label,
  value,
  mono,
  capitalize,
}: {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon && <Icon as={icon} size="sm" className="text-primary" />}
        <Caption>{label}</Caption>
      </div>
      <Body
        className={cn(
          "mt-0.5 truncate font-semibold text-foreground",
          mono && "font-mono tracking-wide",
          capitalize && "capitalize",
        )}
      >
        {value}
      </Body>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <DSCard
      className={cn(
        "flex flex-col items-center gap-2 p-3 text-center sm:p-4",
        highlight && "ring-1 ring-primary/25",
      )}
    >
      <Metric
        className={cn("text-[clamp(18px,6vw,24px)] leading-none", highlight && "text-primary")}
      >
        {value}
      </Metric>
      <Label>{label}</Label>
    </DSCard>
  );
}

function MenuRow({
  icon,
  label,
  sub,
  to,
  onClick,
  trailing,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  sub?: string;
  to?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  const content = (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition active:bg-muted/40">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon as={icon} size="md" />
      </span>
      <div className="min-w-0 flex-1">
        <Body className="font-semibold">{label}</Body>
        {sub && <Caption className="block truncate">{sub}</Caption>}
      </div>
      {trailing}
      <Icon as={ChevronRight} size="sm" className="shrink-0 text-muted-foreground" />
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="block focus:outline-none focus-visible:bg-muted/50">
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left focus:outline-none focus-visible:bg-muted/50"
    >
      {content}
    </button>
  );
}

function Divider() {
  return <div aria-hidden="true" className="mx-4 h-px bg-border/60" />;
}
