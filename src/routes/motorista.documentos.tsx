import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { MovviHeader } from "@/components/MovviHeader";
import { DriverDocumentField } from "@/components/DriverDocumentField";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck, ArrowLeft, CheckCircle2 } from "lucide-react";
import { compressDocumentImage } from "@/lib/imageCompress";
import { updateDriverDocument } from "@/lib/driverDocuments.functions";

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
};

const SLOTS: { slot: Slot; label: string; helper: string; bucket: string; facing?: "user" | "environment" }[] = [
  { slot: "cnh_front", label: "CNH — Frente", helper: "Foto legível, sem reflexos", bucket: "driver-cnh" },
  { slot: "cnh_back", label: "CNH — Verso", helper: "Verso completo da CNH", bucket: "driver-cnh" },
  { slot: "crlv", label: "CRLV do veículo", helper: "Documento atual do veículo", bucket: "vehicle-documents" },
  { slot: "selfie", label: "Selfie de validação", helper: "Rosto visível, boa iluminação", bucket: "driver-selfies", facing: "user" },
];

function slotHasValue(row: DriverRow, slot: Slot) {
  if (slot === "cnh_front") return !!row.cnh_url;
  if (slot === "cnh_back") return !!row.cnh_back_url;
  if (slot === "crlv") return !!row.vehicle_document_url;
  return !!row.selfie_url;
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
          .select("user_id, selfie_url, cnh_url, cnh_back_url, vehicle_document_url, documents_status")
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
    return () => { cancelled = true; };
  }, [navigate]);

  const uploadedCount = useMemo(() => {
    if (!driver) return 0;
    return SLOTS.reduce((acc, s) => acc + (slotHasValue(driver, s.slot) ? 1 : 0), 0);
  }, [driver]);

  async function handleSave(slotDef: (typeof SLOTS)[number]) {
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-background">
        <MovviHeader />
        <div className="container mx-auto max-w-xl px-4 py-10">
          <Alert variant="destructive">
            <AlertDescription>
              Cadastro de motorista não encontrado. Complete seu cadastro primeiro.
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button asChild><Link to="/motorista/cadastro">Ir para cadastro</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <MovviHeader />
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <Link to="/motorista/status" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar ao status
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/30">
            <ShieldCheck className="h-3.5 w-3.5" /> {uploadedCount}/4 enviados
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Meus documentos</CardTitle>
            <CardDescription>
              Envie os documentos necessários para análise da sua conta. Eles ficam privados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(uploadedCount / 4) * 100}%` }}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {SLOTS.map((s) => {
                const hasValue = slotHasValue(driver, s.slot);
                const pendingFile = pending[s.slot] ?? null;
                const busy = saving === s.slot;
                return (
                  <div key={s.slot} className="space-y-2">
                    <DriverDocumentField
                      id={`doc-${s.slot}`}
                      label={s.label}
                      helper={s.helper}
                      file={pendingFile}
                      onChange={(f) => setPending((prev) => ({ ...prev, [s.slot]: f }))}
                      facing={s.facing}
                    />
                    <div className="flex items-center justify-between gap-2 px-1">
                      {hasValue && !pendingFile ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Enviado
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {pendingFile ? "Pronto para enviar" : "Nenhum arquivo"}
                        </span>
                      )}
                      <Button
                        size="sm"
                        disabled={!pendingFile || busy}
                        onClick={() => handleSave(s)}
                      >
                        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                        {hasValue ? "Substituir" : "Enviar"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Após enviar os 4 documentos, sua conta entra em análise (pending_review).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
