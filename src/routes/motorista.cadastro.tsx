import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { translateAuthError } from "@/lib/authErrors";
import { cadastrarMotoristaMobile } from "@/lib/driverRegistration.mobile";
import { DriverDocumentField } from "@/components/DriverDocumentField";
import { compressDocumentImage } from "@/lib/imageCompress";
import {
  DSButton,
  DSCard,
  DSCardContent,
  DSCardDescription,
  DSCardHeader,
  DSCardTitle,
  DSInput,
  DSLabel,
  DSSelect,
  DSSelectContent,
  DSSelectItem,
  DSSelectTrigger,
  DSSelectValue,
} from "@/design-system";

export const Route = createFileRoute("/motorista/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro do Motorista — APOIS" }, { name: "robots", content: "noindex" }] }),
  component: DriverSignUpPage,
});

const CATEGORIES = ["carros", "motos", "fretes", "guincho", "envios"] as const;

const schema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(10, "Telefone inválido").max(20),
  password: z.string().min(8, "Use no mínimo 8 caracteres").max(72),
  cpf: z.string().trim().min(11, "CPF inválido").max(14),
  birth_date: z.string().optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2, "UF com 2 letras"),
  category: z.enum(CATEGORIES),
  vehicle_model: z.string().trim().min(2).max(80),
  vehicle_plate: z.string().trim().min(6).max(10),
  vehicle_color: z.string().trim().min(2).max(40),
  vehicle_year: z.coerce.number().int("Informe um ano válido").min(1971, "O veículo é muito antigo").max(new Date().getFullYear() + 1, "Ano inválido"),
});

async function fileToBase64(file: File, bucket: "driver-selfies" | "driver-cnh" | "vehicle-documents", label: "selfie" | "cnh" | "cnh_back" | "veiculo") {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return {
    bucket,
    label,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    base64: window.btoa(binary),
  };
}

function ApoisWordmark() {
  return (
    <div className="leading-none" aria-label="APOIS Motorista">
      <div className="text-2xl font-black tracking-[0.18em] text-foreground">APOIS</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">Motorista</div>
    </div>
  );
}

function DriverSignUpPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [cnhFront, setCnhFront] = useState<File | null>(null);
  const [cnhBack, setCnhBack] = useState<File | null>(null);
  const [vehicleDoc, setVehicleDoc] = useState<File | null>(null);

  const docsUploaded = [selfie, cnhFront, cnhBack, vehicleDoc].filter(Boolean).length;
  const allDocsReady = docsUploaded === 4;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget).entries()));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    if (!selfie || !cnhFront || !cnhBack || !vehicleDoc) {
      setError("Envie os 4 documentos obrigatórios para continuar.");
      return;
    }

    setLoading(true);
    try {
      const [cSelfie, cCnhF, cCnhB, cVeh] = await Promise.all([
        compressDocumentImage(selfie, { maxSize: 1200, quality: 0.85 }),
        compressDocumentImage(cnhFront),
        compressDocumentImage(cnhBack),
        compressDocumentImage(vehicleDoc),
      ]);

      const documents = await Promise.all([
        fileToBase64(cSelfie, "driver-selfies", "selfie"),
        fileToBase64(cCnhF, "driver-cnh", "cnh"),
        fileToBase64(cCnhB, "driver-cnh", "cnh_back"),
        fileToBase64(cVeh, "vehicle-documents", "veiculo"),
      ]);

      const result = await cadastrarMotoristaMobile({
        ...parsed.data,
        email: parsed.data.email.toLowerCase(),
        state: parsed.data.state.toUpperCase(),
        vehicle_plate: parsed.data.vehicle_plate.toUpperCase(),
        documents: documents as any,
      });

      setSuccess(result.message);
      window.setTimeout(() => navigate({ to: "/motorista/status", replace: true }), 700);
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background py-6 sm:py-10">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/motorista/login" className="inline-flex items-center gap-2"><ApoisWordmark /></Link>
          <DSButton type="button" variant="ghost" size="sm" onClick={() => navigate({ to: "/motorista/login" })} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </DSButton>
        </div>

        <DSCard>
          <DSCardHeader>
            <DSCardTitle className="text-2xl">Cadastro do Motorista</DSCardTitle>
            <DSCardDescription>Preencha seus dados e envie os documentos. O cadastro ficará em análise no painel APOIS.</DSCardDescription>
          </DSCardHeader>
          <DSCardContent>
            <form onSubmit={onSubmit} className="space-y-8">
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase text-primary">Dados pessoais</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><DSLabel htmlFor="name">Nome completo</DSLabel><DSInput id="name" name="name" required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="cpf">CPF</DSLabel><DSInput id="cpf" name="cpf" inputMode="numeric" required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="email">E-mail</DSLabel><DSInput id="email" name="email" type="email" autoComplete="email" required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="phone">Telefone</DSLabel><DSInput id="phone" name="phone" inputMode="tel" required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="password">Senha</DSLabel><DSInput id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="birth_date">Data de nascimento</DSLabel><DSInput id="birth_date" name="birth_date" type="date" /></div>
                  <div className="space-y-2"><DSLabel htmlFor="city">Cidade</DSLabel><DSInput id="city" name="city" required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="state">UF</DSLabel><DSInput id="state" name="state" maxLength={2} required /></div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase text-primary">Veículo e categoria</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <DSLabel htmlFor="category">Categoria</DSLabel>
                    <DSSelect name="category" defaultValue="carros">
                      <DSSelectTrigger id="category"><DSSelectValue /></DSSelectTrigger>
                      <DSSelectContent>{CATEGORIES.map((c) => <DSSelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</DSSelectItem>)}</DSSelectContent>
                    </DSSelect>
                  </div>
                  <div className="space-y-2"><DSLabel htmlFor="vehicle_model">Modelo</DSLabel><DSInput id="vehicle_model" name="vehicle_model" required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="vehicle_plate">Placa</DSLabel><DSInput id="vehicle_plate" name="vehicle_plate" required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="vehicle_color">Cor</DSLabel><DSInput id="vehicle_color" name="vehicle_color" required /></div>
                  <div className="space-y-2"><DSLabel htmlFor="vehicle_year">Ano</DSLabel><DSInput id="vehicle_year" name="vehicle_year" type="number" required /></div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase text-primary">Documentos</h3>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${allDocsReady ? "bg-primary/15 text-primary ring-primary/30" : "bg-muted text-muted-foreground ring-border"}`}>
                    <ShieldCheck className="h-3.5 w-3.5" /> {docsUploaded}/4 enviados
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${(docsUploaded / 4) * 100}%` }} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DriverDocumentField id="doc-cnh-front" label="CNH — Frente" helper="Foto legível, sem reflexos" file={cnhFront} onChange={setCnhFront} />
                  <DriverDocumentField id="doc-cnh-back" label="CNH — Verso" helper="Verso completo da CNH" file={cnhBack} onChange={setCnhBack} />
                  <DriverDocumentField id="doc-crlv" label="CRLV do veículo" helper="Documento atual do veículo" file={vehicleDoc} onChange={setVehicleDoc} />
                  <DriverDocumentField id="doc-selfie" label="Selfie de validação" helper="Rosto visível, boa iluminação" facing="user" file={selfie} onChange={setSelfie} />
                </div>
                <p className="text-[11px] text-muted-foreground">Seus documentos ficam privados e são usados apenas para análise da conta.</p>
              </section>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">Já tem conta? <Link to="/motorista/login" className="text-primary hover:underline">Entrar</Link></p>
                <DSButton type="submit" size="lg" disabled={loading || !allDocsReady} className="sm:min-w-48">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</> : allDocsReady ? "Enviar cadastro" : `Faltam ${4 - docsUploaded} documento(s)`}
                </DSButton>
              </div>
            </form>
          </DSCardContent>
        </DSCard>
      </div>
    </div>
  );
}
