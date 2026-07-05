import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { DriverDocumentField } from "@/components/DriverDocumentField";
import { compressDocumentImage } from "@/lib/imageCompress";
import { updateDriverDocument } from "@/lib/driverDocuments.functions";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import {
  Typography,
  DSButton,
  DSCard,
  StatusPill,
  Loading,
  EmptyState,
  Icon,
  HeadingS,
  Body,
  BodySmall,
  Caption,
} from "@/design-system";
import {
  FileText,
  ShieldCheck,
  ShieldAlert,
  IdCard,
  Car,
  UserRound,
  UploadCloud,
  RefreshCcw,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/motorista/documentos")({
  head: () => ({ meta: [{ title: "Meus documentos — MOVVI DRIVE" }] }),
  component: DriverDocumentsPage,
});

type Slot = "cnh_front" | "cnh_back" | "crlv" | "selfie";

type DriverRow = {
  user_id: string;
  selfie_url: string | null;
  cnh_url: string | null;
  cnh_back_url: string | null;
  vehicle_document_url: string | null;
  documents_status: string;
  approval_status: string;
};

type SlotDef = {
  slot: Slot;
  label: string;
  helper: string;
  bucket: string;
  icon: typeof IdCard;
  facing?: "user" | "environment";
};

const SLOTS: SlotDef[] = [
  { slot: "cnh_front", label: "CNH — Frente", helper: "Foto legível, sem reflexos", bucket: "driver-cnh", icon: IdCard },
  { slot: "cnh_back", label: "CNH — Verso", helper: "Verso completo da CNH", bucket: "driver-cnh", icon: IdCard },
  { slot: "crlv", label: "CRLV do veículo", helper: "Documento atual do veículo", bucket: "vehicle-documents", icon: Car },
  { slot: "selfie", label: "Selfie de validação", helper: "Rosto visível, boa iluminação", bucket: "driver-selfies", icon: UserRound, facing: "user" },
];

function slotHasValue(row: DriverRow, slot: Slot) {
  if (slot === "cnh_front") return !!row.cnh_url;
  if (slot === "cnh_back") return !!row.cnh_back_url;
  if (slot === "crlv") return !!row.vehicle_document_url;
  return !!row.selfie_url;
}

/** Map documents_status → StatusPill token + label. */
function overallStatusPill(status: string, complete: boolean) {
  if (status === "approved") return <StatusPill status="finished" label="Aprovado" pulse={false} />;
  if (status === "rejected") return <StatusPill status="cancelled" label="Reprovado" pulse={false} />;
  if (status === "pending_review" || complete) return <StatusPill status="searching" label="Em análise" />;
  return <StatusPill status="offline" label="Pendente" pulse={false} />;
}

function slotStatusPill(overall: string, hasValue: boolean) {
  if (!hasValue) return <StatusPill status="offline" label="Pendente" pulse={false} />;
  if (overall === "approved") return <StatusPill status="finished" label="Aprovado" pulse={false} />;
  if (overall === "rejected") return <StatusPill status="cancelled" label="Reprovado" pulse={false} />;
  return <StatusPill status="searching" label="Em análise" />;
}

function DriverDocumentsPage() {
  const navigate = useNavigate();
  const callUpdate = useServerFn(updateDriverDocument);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Partial<Record<Slot, File | null>>>({});
  const [saving, setSaving] = useState<Slot | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const userId = session.session?.user?.id;
        if (!userId) {
          navigate({ to: "/motorista/login" });
          return;
        }
        const { data, error: dbErr } = await supabase
          .from("drivers")
          .select("user_id, selfie_url, cnh_url, cnh_back_url, vehicle_document_url, documents_status, approval_status")
          .eq("user_id", userId)
          .maybeSingle();
        if (dbErr) throw dbErr;
        if (!cancelled) setDriver(data as DriverRow | null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const uploadedCount = useMemo(() => {
    if (!driver) return 0;
    return SLOTS.reduce((acc, s) => acc + (slotHasValue(driver, s.slot) ? 1 : 0), 0);
  }, [driver]);

  const complete = uploadedCount === SLOTS.length;
  const progressPct = (uploadedCount / SLOTS.length) * 100;

  async function handleSave(slotDef: SlotDef) {
    const file = pending[slotDef.slot];
    if (!file || !driver) return;
    setSaving(slotDef.slot);
    setError(null);
    setMessage(null);
    try {
      const compressed = await compressDocumentImage(file, { maxSize: 1600, quality: 0.85 });
      const ext = (compressed.type.split("/")[1] || "jpg").toLowerCase();
      const path = `${driver.user_id}/${slotDef.slot}-${Date.now()}.${ext}`;

      const up = await supabase.storage
        .from(slotDef.bucket)
        .upload(path, compressed, { upsert: true, contentType: compressed.type });
      if (up.error) throw up.error;

      const result = await callUpdate({ data: { slot: slotDef.slot, storagePath: path } });

      setDriver((prev) => {
        if (!prev) return prev;
        const next: DriverRow = { ...prev };
        if (slotDef.slot === "cnh_front") next.cnh_url = path;
        else if (slotDef.slot === "cnh_back") next.cnh_back_url = path;
        else if (slotDef.slot === "crlv") next.vehicle_document_url = path;
        else next.selfie_url = path;
        next.documents_status = result.documents_status ?? next.documents_status;
        return next;
      });
      setPending((prev) => ({ ...prev, [slotDef.slot]: null }));
      setMessage(result.complete ? "Documentos enviados para análise." : "Documento salvo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar documento.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <SettingsPageShell>
        <Loading label="Carregando documentos…" />
      </SettingsPageShell>
    );
  }

  if (!driver) {
    return (
      <SettingsPageShell>
        <EmptyState
          icon={FileText}
          title="Cadastro não encontrado"
          description="Complete seu cadastro de motorista para enviar os documentos."
          action={
            <DSButton asChild>
              <Link to="/motorista/cadastro">Ir para cadastro</Link>
            </DSButton>
          }
        />
      </SettingsPageShell>
    );
  }

  const overall = driver.documents_status;

  return (
    <SettingsPageShell>
      <SettingsHero
        icon={FileText}
        title="Meus documentos"
        subtitle="Envie os documentos necessários para análise da sua conta."
        action={overallStatusPill(overall, complete)}
      />

      {/* Progresso geral */}
      <DSCard className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <HeadingS>Progresso da verificação</HeadingS>
            <BodySmall className="text-muted-foreground">
              {complete
                ? "Todos os documentos foram enviados."
                : `Envie os ${SLOTS.length} documentos obrigatórios para liberar sua conta.`}
            </BodySmall>
          </div>
          <div className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5">
            <Typography variant="metric" className="text-[clamp(14px,4.6vw,18px)] text-primary">
              {uploadedCount}/{SLOTS.length}
            </Typography>
          </div>
        </div>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={uploadedCount}
          aria-valuemin={0}
          aria-valuemax={SLOTS.length}
          aria-label="Progresso do envio de documentos"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
            <Icon as={ShieldAlert} size="md" className="mt-0.5 text-destructive" />
            <BodySmall className="text-destructive">{error}</BodySmall>
          </div>
        ) : null}
        {message ? (
          <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
            <Icon as={ShieldCheck} size="md" className="mt-0.5 text-primary" />
            <BodySmall className="text-primary">{message}</BodySmall>
          </div>
        ) : null}
      </DSCard>

      {/* Lista de documentos */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SLOTS.map((s) => {
          const hasValue = slotHasValue(driver, s.slot);
          const pendingFile = pending[s.slot] ?? null;
          const busy = saving === s.slot;

          return (
            <DSCard key={s.slot} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon as={s.icon} size="lg" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <HeadingS className="truncate">{s.label}</HeadingS>
                    <Caption className="block">{s.helper}</Caption>
                  </div>
                </div>
                <div className="shrink-0">{slotStatusPill(overall, hasValue)}</div>
              </div>

              <DriverDocumentField
                id={`doc-${s.slot}`}
                label={s.label}
                helper={s.helper}
                file={pendingFile}
                onChange={(f) => setPending((prev) => ({ ...prev, [s.slot]: f }))}
                facing={s.facing}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Body className="text-muted-foreground">
                  {pendingFile
                    ? "Pronto para enviar"
                    : hasValue
                      ? "Documento enviado"
                      : "Nenhum arquivo"}
                </Body>
                <DSButton
                  size="sm"
                  disabled={!pendingFile || busy}
                  onClick={() => handleSave(s)}
                  aria-label={hasValue ? `Reenviar ${s.label}` : `Enviar ${s.label}`}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Icon
                      as={hasValue ? RefreshCcw : UploadCloud}
                      size="sm"
                      className="mr-1.5"
                    />
                  )}
                  {hasValue ? "Reenviar" : "Enviar"}
                </DSButton>
              </div>
            </DSCard>
          );
        })}
      </div>

      <Caption className="block px-1 text-center">
        Após enviar os {SLOTS.length} documentos, sua conta entra em análise.
      </Caption>
    </SettingsPageShell>
  );
}
