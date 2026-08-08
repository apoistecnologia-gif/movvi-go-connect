import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
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
};

const documents: DocConfig[] = [
  { slot: "selfie", title: "Selfie do motorista", description: "Foto atual, de frente e com boa iluminação.", icon: Camera, profileKey: "selfie_url", accept: "image/jpeg,image/png,image/webp" },
  { slot: "cnh_front", title: "CNH — frente", description: "Documento legível e dentro da validade.", icon: IdCard, profileKey: "cnh_url", accept: "image/jpeg,image/png,image/webp,application/pdf" },
  { slot: "cnh_back", title: "CNH — verso", description: "Envie o verso do mesmo documento.", icon: IdCard, profileKey: "cnh_back_url", accept: "image/jpeg,image/png,image/webp,application/pdf" },
  { slot: "crlv", title: "Documento do veículo", description: "CRLV legível do veículo cadastrado.", icon: FileText, profileKey: "vehicle_document_url", accept: "image/jpeg,image/png,image/webp,application/pdf" },
  { slot: "vehicle_photo", title: "Foto do veículo", description: "Mostre o veículo cadastrado de forma nítida.", icon: CarFront, profileKey: "vehicle_photo_url", accept: "image/jpeg,image/png,image/webp" },
];

function statusLabel(profile: DriverProfileRow | null): string {
  if (!profile) return "Carregando";
  if (profile.documents_status === "approved" && profile.approval_status === "aprovado") return "Aprovados";
  if (profile.documents_status === "rejected" || profile.approval_status === "reprovado") return "Reenvio necessário";
  if (profile.documents_status === "pending_review" || profile.approval_status === "em_analise") return "Em análise";
  return "Envio incompleto";
}

function DriverDocumentsPage() {
  const navigate = useNavigate();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [profile, setProfile] = useState<DriverProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<DriverDocumentSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadDriverProfile();
    if (!result.ok) {
      if (result.reason === "no_session") {
        await navigate({ to: "/motorista/login", replace: true });
        return;
      }
      setError("Não foi possível carregar o cadastro do motorista agora.");
      setLoading(false);
      return;
    }
    setProfile(result.profile);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  const handleFile = async (slot: DriverDocumentSlot, file?: File): Promise<void> => {
    if (!file || savingSlot) return;
    setSavingSlot(slot);
    try {
      const result = await uploadDriverDocument(slot, file);
      toast.success(result.complete ? "Documento enviado. Seu cadastro voltou para análise." : "Documento enviado. Complete os demais itens para iniciar a análise.");
      await load();
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : "Não foi possível enviar o documento.");
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#050607] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#08090A]/95 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button type="button" aria-label="Voltar" onClick={() => void navigate({ to: "/motorista/perfil" })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] active:scale-95"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#F6BE1C]">Cadastro e segurança</p><h1 className="mt-0.5 text-xl font-black tracking-tight">Meus documentos</h1></div>
          <button type="button" aria-label="Atualizar" disabled={loading} onClick={() => void load()} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-[#111315] text-[#F6BE1C] disabled:opacity-50"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+28px)]">
        <section className="rounded-[26px] border border-[#F6BE1C]/18 bg-gradient-to-br from-[#211A08] via-[#111315] to-[#08090A] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C] text-black"><ShieldCheck className="h-6 w-6" /></div>
            <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Status documental</p><h2 className="mt-1 text-lg font-black">{statusLabel(profile)}</h2><p className="mt-2 text-[11px] font-medium leading-5 text-zinc-500">Sempre que um documento obrigatório for substituído, o motorista sai do modo online e o cadastro volta para análise antes de receber novas corridas.</p></div>
          </div>
        </section>

        {error ? <section className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4 text-xs font-bold text-red-300">{error}</section> : null}

        {loading && !profile ? (
          <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#F6BE1C]" /></div>
        ) : (
          <section className="space-y-3">
            {documents.map((document) => {
              const Icon = document.icon;
              const hasFile = Boolean(profile?.[document.profileKey]);
              const saving = savingSlot === document.slot;
              return (
                <article key={document.slot} className="rounded-[24px] border border-white/6 bg-[#0D0F11] p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${hasFile ? "bg-emerald-400/10 text-emerald-400" : "bg-[#F6BE1C]/10 text-[#F6BE1C]"}`}>{hasFile ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</div>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="text-sm font-black">{document.title}</h3>{hasFile ? <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[8px] font-black uppercase text-emerald-400">Enviado</span> : null}</div><p className="mt-1 text-[10px] font-medium leading-4 text-zinc-600">{document.description}</p></div>
                  </div>
                  <input ref={(node) => { inputRefs.current[document.slot] = node; }} type="file" accept={document.accept} className="hidden" disabled={Boolean(savingSlot)} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void handleFile(document.slot, file); }} />
                  <button type="button" disabled={Boolean(savingSlot)} onClick={() => inputRefs.current[document.slot]?.click()} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/8 bg-[#141719] text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-[#F6BE1C]" />}{saving ? "Enviando..." : hasFile ? "Substituir documento" : "Enviar documento"}</button>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
