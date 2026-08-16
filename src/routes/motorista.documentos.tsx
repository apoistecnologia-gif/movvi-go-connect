import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CarFront,
  CheckCircle2,
  FileText,
  IdCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { loadDriverProfile, type DriverProfileRow } from "@/lib/driverProfile";
import {
  uploadDriverDocument,
  type DriverDocumentSlot,
} from "@/lib/driverDocuments.mobile";

export const Route = createFileRoute("/motorista/documentos")({
  component: DriverDocumentsPage,
  head: () => ({ meta: [{ title: "Documentos — APOIS Motorista" }] }),
});

type DocConfig = {
  slot: DriverDocumentSlot;
  title: string;
  description: string;
  icon: typeof IdCard;
  profileKey: keyof Pick<
    DriverProfileRow,
    "selfie_url" | "cnh_url" | "cnh_back_url" | "vehicle_document_url" | "vehicle_photo_url"
  >;
  accept: string;
  maxBytes: number;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;

const documents: DocConfig[] = [
  { slot: "selfie", title: "Selfie do motorista", description: "Foto atual, de frente e com boa iluminação.", icon: Camera, profileKey: "selfie_url", accept: "image/jpeg,image/png,image/webp", maxBytes: MAX_IMAGE_BYTES },
  { slot: "cnh_front", title: "CNH — frente", description: "Documento legível e dentro da validade.", icon: IdCard, profileKey: "cnh_url", accept: "image/jpeg,image/png,image/webp,application/pdf", maxBytes: MAX_DOCUMENT_BYTES },
  { slot: "cnh_back", title: "CNH — verso", description: "Envie o verso do mesmo documento.", icon: IdCard, profileKey: "cnh_back_url", accept: "image/jpeg,image/png,image/webp,application/pdf", maxBytes: MAX_DOCUMENT_BYTES },
  { slot: "crlv", title: "Documento do veículo", description: "CRLV legível do veículo cadastrado.", icon: FileText, profileKey: "vehicle_document_url", accept: "image/jpeg,image/png,image/webp,application/pdf", maxBytes: MAX_DOCUMENT_BYTES },
  { slot: "vehicle_photo", title: "Foto do veículo", description: "Mostre o veículo cadastrado de forma nítida.", icon: CarFront, profileKey: "vehicle_photo_url", accept: "image/jpeg,image/png,image/webp", maxBytes: MAX_IMAGE_BYTES },
];

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function statusLabel(profile: DriverProfileRow | null): string {
  if (!profile) return "Carregando";
  const documentsStatus = normalizeStatus(profile.documents_status);
  const approvalStatus = normalizeStatus(profile.approval_status);
  if (["rejected", "reprovado", "reprovada"].includes(documentsStatus) || ["rejected", "reprovado", "reprovada"].includes(approvalStatus)) return "Reenvio necessário";
  if (["pending_review", "em_analise", "em análise"].includes(documentsStatus) || ["pending_review", "em_analise", "em análise"].includes(approvalStatus)) return "Em análise";
  if (["approved", "aprovado", "aprovada"].includes(documentsStatus)) return "Aprovados";
  return "Envio incompleto";
}

function isAllowedFile(file: File, config: DocConfig): boolean {
  const accepted = config.accept.split(",").map((item) => item.trim().toLowerCase());
  return accepted.includes(file.type.toLowerCase());
}

function hasUploadedValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function DriverDocumentsPage() {
  const navigate = useNavigate();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const loadRequestRef = useRef(0);
  const [profile, setProfile] = useState<DriverProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<DriverDocumentSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loadDriverProfile();
      if (requestId !== loadRequestRef.current) return;
      if (!result.ok) {
        if (result.reason === "no_session") {
          await navigate({ to: "/motorista/login", replace: true });
          return;
        }
        setError("Não foi possível carregar o cadastro do motorista agora.");
        return;
      }
      setProfile(result.profile);
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Documents] load failed", caughtError);
      if (requestId === loadRequestRef.current) setError("Não foi possível carregar seus documentos agora.");
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !savingSlot) void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [load, savingSlot]);

  const handleFile = async (config: DocConfig, file?: File): Promise<void> => {
    if (savingSlot) return;
    if (!file) {
      setUploadError("Nenhum arquivo foi selecionado.");
      return;
    }
    if (!isAllowedFile(file, config)) {
      setUploadError("Formato não aceito. Envie JPG, PNG, WEBP ou PDF quando permitido.");
      return;
    }
    if (!Number.isFinite(file.size) || file.size <= 0) {
      setUploadError("O arquivo selecionado está vazio ou inválido.");
      return;
    }
    if (file.size > config.maxBytes) {
      setUploadError(`Arquivo muito grande. Use um arquivo de até ${Math.round(config.maxBytes / 1024 / 1024)} MB.`);
      return;
    }

    const replacing = hasUploadedValue(profile?.[config.profileKey]);
    if (replacing) {
      const confirmed = window.confirm("Substituir este documento? Seu cadastro poderá voltar para análise antes de receber novas corridas.");
      if (!confirmed) return;
    }

    setSavingSlot(config.slot);
    setUploadError(null);
    try {
      const result = await uploadDriverDocument(config.slot, file);
      toast.success(result.complete ? "Documento enviado. Seu cadastro voltou para análise." : "Documento enviado. Complete os demais itens para iniciar a análise.");
      await load();
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Documents] upload failed", caughtError);
      setUploadError("Não foi possível enviar o documento. Verifique o arquivo e tente novamente.");
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <div className="min-h-[100dvh] min-w-0 bg-[#050607] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#08090A]/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl min-w-0 items-center gap-3">
          <button type="button" aria-label="Voltar" disabled={Boolean(savingSlot)} onClick={() => void navigate({ to: "/motorista/perfil" })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] disabled:opacity-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
          <div className="min-w-0 flex-1"><p className="break-words text-[11px] font-black uppercase tracking-[0.16em] text-[#F6BE1C] sm:tracking-[0.2em]">Cadastro e segurança</p><h1 className="mt-0.5 break-words text-xl font-black leading-tight tracking-tight">Meus documentos</h1></div>
          <button type="button" aria-label={loading ? "Atualizando documentos" : "Atualizar documentos"} aria-busy={loading} disabled={loading || Boolean(savingSlot)} onClick={() => void load()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-[#F6BE1C] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"><RefreshCw aria-hidden="true" className={loading ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} /></button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl min-w-0 space-y-4 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+28px)]">
        <section className="min-w-0 rounded-[26px] border border-[#F6BE1C]/18 bg-gradient-to-br from-[#211A08] via-[#111315] to-[#08090A] p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C] text-black"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div>
            <div className="min-w-0 flex-1"><p className="break-words text-[11px] font-black uppercase tracking-[0.16em] text-[#F6BE1C] sm:tracking-[0.18em]">Status documental</p><h2 className="mt-1 break-words text-lg font-black">{statusLabel(profile)}</h2><p className="mt-2 break-words text-xs font-medium leading-5 text-zinc-500">Sempre que um documento obrigatório for substituído, o motorista sai do modo online e o cadastro volta para análise antes de receber novas corridas.</p></div>
          </div>
        </section>

        {error ? <section role="alert" aria-live="assertive" className="min-w-0 rounded-2xl border border-red-500/20 bg-red-500/8 p-4"><div className="flex min-w-0 items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" /><p className="min-w-0 flex-1 break-words text-xs font-bold leading-5 text-red-300">{error}</p></div><button type="button" onClick={() => void load()} disabled={loading} className="mt-3 min-h-11 w-full rounded-xl border border-red-300/20 px-4 text-xs font-black text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Tentar novamente</button></section> : null}
        {uploadError ? <section role="alert" aria-live="assertive" className="break-words rounded-2xl border border-amber-400/20 bg-amber-400/8 p-4 text-xs font-bold leading-5 text-amber-100">{uploadError}</section> : null}

        {loading && !profile ? (
          <div className="flex min-h-[45vh] items-center justify-center" role="status" aria-label="Carregando documentos"><Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-[#F6BE1C] motion-reduce:animate-none" /></div>
        ) : (
          <section className="space-y-3" aria-label="Documentos do motorista">
            {documents.map((document) => {
              const Icon = document.icon;
              const hasFile = hasUploadedValue(profile?.[document.profileKey]);
              const saving = savingSlot === document.slot;
              const inputId = `driver-document-${document.slot}`;
              return (
                <article key={document.slot} className="min-w-0 rounded-[24px] border border-white/6 bg-[#0D0F11] p-4" aria-busy={saving}>
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${hasFile ? "bg-emerald-400/10 text-emerald-400" : "bg-[#F6BE1C]/10 text-[#F6BE1C]"}`} aria-hidden="true">{hasFile ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</div>
                    <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><h3 className="min-w-0 break-words text-sm font-black leading-5">{document.title}</h3>{hasFile ? <span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-1 text-[11px] font-black uppercase text-emerald-400">Enviado</span> : null}</div><p className="mt-1 break-words text-xs font-medium leading-4 text-zinc-500">{document.description}</p></div>
                  </div>
                  <input id={inputId} ref={(node) => { inputRefs.current[document.slot] = node; }} type="file" accept={document.accept} className="sr-only" disabled={Boolean(savingSlot)} aria-label={`Selecionar arquivo para ${document.title}`} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void handleFile(document, file); }} />
                  <button type="button" disabled={Boolean(savingSlot)} aria-busy={saving} onClick={() => { setUploadError(null); inputRefs.current[document.slot]?.click(); }} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/8 bg-[#141719] px-3 py-2 text-center text-xs font-black leading-5 text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]">{saving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Upload className="h-4 w-4 shrink-0 text-[#F6BE1C]" aria-hidden="true" />}{saving ? "Enviando..." : hasFile ? "Substituir documento" : "Enviar documento"}</button>
                  <p className="mt-2 break-words text-[11px] leading-4 text-zinc-600">Formatos aceitos conforme o documento. Limite: {Math.round(document.maxBytes / 1024 / 1024)} MB.</p>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}