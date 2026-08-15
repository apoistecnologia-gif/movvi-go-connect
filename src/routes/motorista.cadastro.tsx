import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileText,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { translateAuthError } from "@/lib/authErrors";
import { cadastrarMotoristaMobile } from "@/lib/driverRegistration.mobile";
import { DriverDocumentField } from "@/components/DriverDocumentField";
import { compressDocumentImage } from "@/lib/imageCompress";
import { MovviLogo } from "@/components/MovviLogo";
import {
  DSButton,
  DSInput,
  DSLabel,
  DSSelect,
  DSSelectContent,
  DSSelectItem,
  DSSelectTrigger,
  DSSelectValue,
} from "@/design-system";

export const Route = createFileRoute("/motorista/cadastro")({
  head: () => ({
    meta: [
      { title: "Cadastro do Motorista — APOIS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DriverSignUpPage,
});

const CATEGORIES = ["carros", "motos", "fretes", "guincho", "envios"] as const;

const schema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(10, "Telefone inválido").max(20),
  password: z.string().min(8, "Use no mínimo 8 caracteres").max(72),
  cpf: z.string().trim().min(11, "CPF inválido").max(14),
  birth_date: z.string().optional(),
  city: z.string().trim().min(2, "Informe sua cidade").max(80),
  state: z.string().trim().length(2, "UF com 2 letras"),
  category: z.enum(CATEGORIES),
  vehicle_model: z.string().trim().min(2, "Informe o modelo do veículo").max(80),
  vehicle_plate: z.string().trim().min(6, "Informe a placa").max(10),
  vehicle_color: z.string().trim().min(2, "Informe a cor").max(40),
  vehicle_year: z.coerce
    .number()
    .int("Informe um ano válido")
    .min(1971, "Ano do veículo inválido")
    .max(new Date().getFullYear() + 1, "Ano inválido"),
});

type Bucket = "driver-selfies" | "driver-cnh" | "vehicle-documents";
type Label = "selfie" | "cnh" | "cnh_back" | "veiculo" | "vehicle_photo";

async function fileToBase64(file: File, bucket: Bucket, label: Label) {
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

function ProgressSteps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Etapa ${step} de 3`}>
      {[1, 2, 3].map((value) => {
        const complete = value < step;
        const active = value === step;
        return (
          <div key={value} className="flex items-center gap-2 last:gap-0">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-black ${
                active
                  ? "border-[#F6BE1C] bg-[#F6BE1C] text-black"
                  : complete
                    ? "border-[#F6BE1C]/45 bg-[#F6BE1C]/15 text-[#F6BE1C]"
                    : "border-white/10 bg-white/5 text-zinc-600"
              }`}
            >
              {complete ? <Check className="h-3.5 w-3.5" /> : value}
            </div>
            {value < 3 ? (
              <div className={`h-px w-8 ${value < step ? "bg-[#F6BE1C]/50" : "bg-white/10"}`} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FieldShell({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <DSLabel className="flex items-center gap-2 text-[11px] font-black text-zinc-300">
        <Icon className="h-3.5 w-3.5 text-[#F6BE1C]" />
        {label}
      </DSLabel>
      {children}
    </div>
  );
}

function SuccessScreen() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[100dvh] bg-[#050607] text-white">
      <header className="flex items-center justify-between px-5 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <MovviLogo size={44} />
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Etapa 3 de 3</span>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5">
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-[#F6BE1C]/25 bg-[#F6BE1C]/8 shadow-[0_0_60px_-14px_rgba(246,190,28,0.55)]">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#F6BE1C]">
            <Check className="h-10 w-10 text-[#F6BE1C]" strokeWidth={2.5} />
          </div>
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-[26px] font-black leading-tight tracking-tight">
            Cadastro enviado <span className="text-[#F6BE1C]">com sucesso!</span>
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-[13px] font-medium leading-relaxed text-zinc-400">
            Recebemos seus dados e documentos. Agora nossa equipe vai analisar as informações antes de liberar sua conta.
          </p>
        </div>

        <section className="mt-6 rounded-[24px] border border-white/5 bg-[#101214] p-4">
          <p className="text-[11px] font-black text-[#F6BE1C]">O que acontece agora?</p>
          <div className="mt-4 space-y-3">
            {[
              [FileCheck2, "Análise dos documentos", "Nossa equipe irá verificar suas informações."],
              [BadgeCheck, "Você será notificado", "Avisaremos quando o cadastro for aprovado ou se precisar de correção."],
              [Car, "Tudo aprovado?", "Depois é só ativar a mensalidade e começar a receber corridas."],
            ].map(([Icon, title, description]) => (
              <div key={String(title)} className="flex items-start gap-3 rounded-2xl bg-black/35 px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F6BE1C]/10 text-[#F6BE1C]">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-white">{String(title)}</p>
                  <p className="mt-0.5 text-[10.5px] font-medium leading-relaxed text-zinc-500">{String(description)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 flex items-start gap-3 rounded-[22px] border border-[#F6BE1C]/15 bg-[#F6BE1C]/5 px-4 py-4">
          <Phone className="mt-0.5 h-5 w-5 shrink-0 text-[#F6BE1C]" />
          <div>
            <p className="text-[12px] font-black text-[#F6BE1C]">Fique de olho no app</p>
            <p className="mt-1 text-[10.5px] font-medium leading-relaxed text-zinc-400">
              Acompanhe o status da solicitação pelo próprio APOIS Motorista.
            </p>
          </div>
        </section>

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/motorista/status", replace: true })}
            className="flex h-14 w-full items-center justify-center rounded-[18px] bg-[#F6BE1C] text-[13px] font-black text-black shadow-[0_18px_38px_-24px_rgba(246,190,28,0.8)]"
          >
            Acompanhar análise
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/motorista/login", replace: true })}
            className="flex h-12 w-full items-center justify-center rounded-[18px] border border-[#F6BE1C]/25 bg-transparent text-[11px] font-black uppercase tracking-[0.12em] text-[#F6BE1C]"
          >
            Sair
          </button>
        </div>
      </main>
    </div>
  );
}

function DriverSignUpPage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [selfie, setSelfie] = useState<File | null>(null);
  const [cnhFront, setCnhFront] = useState<File | null>(null);
  const [cnhBack, setCnhBack] = useState<File | null>(null);
  const [vehicleDoc, setVehicleDoc] = useState<File | null>(null);
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);

  const documentItems = useMemo(
    () => [
      Boolean(selfie),
      Boolean(cnhFront && cnhBack),
      Boolean(vehicleDoc),
      Boolean(vehiclePhoto),
    ],
    [selfie, cnhFront, cnhBack, vehicleDoc, vehiclePhoto],
  );
  const completedItems = documentItems.filter(Boolean).length;
  const allDocsReady = completedItems === 4;

  function validateStep(targetStep: 1 | 2) {
    const form = formRef.current;
    if (!form) return false;
    const data = new FormData(form);
    const fields = targetStep === 1
      ? ["category", "vehicle_model", "vehicle_plate", "vehicle_color", "vehicle_year"]
      : ["name", "cpf", "phone", "birth_date", "email", "password", "city", "state"];

    for (const field of fields) {
      const element = form.elements.namedItem(field) as HTMLInputElement | null;
      if (element && !element.checkValidity()) {
        element.reportValidity();
        return false;
      }
      if (field !== "birth_date" && !String(data.get(field) ?? "").trim()) {
        setError("Preencha todos os campos obrigatórios para continuar.");
        return false;
      }
    }
    setError(null);
    return true;
  }

  function nextStep() {
    if (step === 1 && validateStep(1)) setStep(2);
    else if (step === 2 && validateStep(2)) setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previousStep() {
    if (step === 1) {
      navigate({ to: "/motorista/login" });
      return;
    }
    setError(null);
    setStep((step - 1) as 1 | 2 | 3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget).entries()));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    if (!selfie || !cnhFront || !cnhBack || !vehicleDoc || !vehiclePhoto) {
      setError("Envie todos os documentos e a foto do veículo para continuar.");
      return;
    }

    setLoading(true);
    try {
      const [cSelfie, cCnhF, cCnhB, cVeh, cVehiclePhoto] = await Promise.all([
        compressDocumentImage(selfie, { maxSize: 1200, quality: 0.85 }),
        compressDocumentImage(cnhFront),
        compressDocumentImage(cnhBack),
        compressDocumentImage(vehicleDoc),
        compressDocumentImage(vehiclePhoto, { maxSize: 1400, quality: 0.85 }),
      ]);

      const documents = await Promise.all([
        fileToBase64(cSelfie, "driver-selfies", "selfie"),
        fileToBase64(cCnhF, "driver-cnh", "cnh"),
        fileToBase64(cCnhB, "driver-cnh", "cnh_back"),
        fileToBase64(cVeh, "vehicle-documents", "veiculo"),
        fileToBase64(cVehiclePhoto, "vehicle-documents", "vehicle_photo"),
      ]);

      await cadastrarMotoristaMobile({
        ...parsed.data,
        email: parsed.data.email.toLowerCase(),
        state: parsed.data.state.toUpperCase(),
        vehicle_plate: parsed.data.vehicle_plate.toUpperCase(),
        documents: documents as any,
      });

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (submitted) return <SuccessScreen />;

  return (
    <div className="min-h-[100dvh] bg-[#050607] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#050607]/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <button
            type="button"
            onClick={previousStep}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-[#101214] text-zinc-300"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col items-center gap-1.5">
            <ProgressSteps step={step} />
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">Etapa {step} de 3</span>
          </div>
          <MovviLogo size={42} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6">
        <form ref={formRef} onSubmit={onSubmit} noValidate>
          <section className={step === 1 ? "block" : "hidden"}>
            <div className="mb-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-[25px] font-black leading-tight tracking-tight">Seu veículo</h1>
                  <p className="mt-1 text-[12px] font-medium leading-relaxed text-zinc-500">
                    Conte qual serviço você vai oferecer pela APOIS.
                  </p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#F6BE1C]/15 bg-[#F6BE1C]/8 text-[#F6BE1C]">
                  <Car className="h-8 w-8" strokeWidth={1.8} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <FieldShell label="Categoria" icon={Car}>
                <DSSelect name="category" defaultValue="carros">
                  <DSSelectTrigger className="h-12 rounded-xl border-white/10 bg-[#0D0F11]"><DSSelectValue /></DSSelectTrigger>
                  <DSSelectContent>
                    {CATEGORIES.map((category) => (
                      <DSSelectItem key={category} value={category}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </DSSelectItem>
                    ))}
                  </DSSelectContent>
                </DSSelect>
              </FieldShell>
              <FieldShell label="Modelo do veículo" icon={Car}>
                <DSInput name="vehicle_model" required placeholder="Ex.: Chevrolet Onix" className="h-12 bg-[#0D0F11]" />
              </FieldShell>
              <div className="grid grid-cols-2 gap-3">
                <FieldShell label="Placa" icon={Car}>
                  <DSInput name="vehicle_plate" required placeholder="ABC1D23" className="h-12 bg-[#0D0F11] uppercase" />
                </FieldShell>
                <FieldShell label="Ano" icon={Car}>
                  <DSInput name="vehicle_year" type="number" required placeholder="2022" className="h-12 bg-[#0D0F11]" />
                </FieldShell>
              </div>
              <FieldShell label="Cor" icon={Car}>
                <DSInput name="vehicle_color" required placeholder="Ex.: Preto" className="h-12 bg-[#0D0F11]" />
              </FieldShell>
            </div>

            <div className="mt-6 rounded-[20px] border border-[#F6BE1C]/15 bg-[#F6BE1C]/5 px-4 py-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#F6BE1C]" />
                <p className="text-[10.5px] font-medium leading-relaxed text-zinc-400">
                  Esses dados serão usados para identificar seu veículo nas corridas e na análise do cadastro.
                </p>
              </div>
            </div>
          </section>

          <section className={step === 2 ? "block" : "hidden"}>
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-[25px] font-black leading-tight tracking-tight">Informações pessoais</h1>
                <p className="mt-1 max-w-[260px] text-[12px] font-medium leading-relaxed text-zinc-500">
                  Precisamos destes dados para criar sua conta e analisar o cadastro.
                </p>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#F6BE1C]/15 bg-[#F6BE1C]/8 text-[#F6BE1C]">
                <BadgeCheck className="h-8 w-8" strokeWidth={1.8} />
              </div>
            </div>

            <div className="space-y-4">
              <FieldShell label="Nome completo" icon={UserRound}>
                <DSInput name="name" required autoComplete="name" placeholder="Seu nome completo" className="h-12 bg-[#0D0F11]" />
              </FieldShell>
              <FieldShell label="CPF" icon={FileText}>
                <DSInput name="cpf" required inputMode="numeric" placeholder="000.000.000-00" className="h-12 bg-[#0D0F11]" />
              </FieldShell>
              <FieldShell label="Telefone (WhatsApp)" icon={Phone}>
                <DSInput name="phone" required inputMode="tel" autoComplete="tel" placeholder="(87) 99999-9999" className="h-12 bg-[#0D0F11]" />
              </FieldShell>
              <FieldShell label="Data de nascimento" icon={UserRound}>
                <DSInput name="birth_date" type="date" className="h-12 bg-[#0D0F11]" />
              </FieldShell>
              <FieldShell label="E-mail" icon={Mail}>
                <DSInput name="email" required type="email" autoComplete="email" placeholder="voce@email.com" className="h-12 bg-[#0D0F11]" />
              </FieldShell>
              <FieldShell label="Senha" icon={LockKeyhole}>
                <DSInput name="password" required type="password" autoComplete="new-password" minLength={8} placeholder="Mínimo de 8 caracteres" className="h-12 bg-[#0D0F11]" />
              </FieldShell>
              <div className="grid grid-cols-[1fr_84px] gap-3">
                <FieldShell label="Cidade onde você vai atuar" icon={MapPin}>
                  <DSInput name="city" required placeholder="Ex.: Petrolina" className="h-12 bg-[#0D0F11]" />
                </FieldShell>
                <FieldShell label="UF" icon={MapPin}>
                  <DSInput name="state" required maxLength={2} placeholder="PE" className="h-12 bg-[#0D0F11] uppercase" />
                </FieldShell>
              </div>
            </div>

            <div className="mt-6 rounded-[20px] border border-[#F6BE1C]/15 bg-[#F6BE1C]/5 px-4 py-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#F6BE1C]" />
                <div>
                  <p className="text-[11px] font-black text-[#F6BE1C]">Seus dados estão protegidos</p>
                  <p className="mt-1 text-[10.5px] font-medium leading-relaxed text-zinc-500">
                    Usamos criptografia e boas práticas de segurança para proteger suas informações.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className={step === 3 ? "block" : "hidden"}>
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-[25px] font-black leading-tight tracking-tight">Documentos necessários</h1>
                <p className="mt-1 max-w-[270px] text-[12px] font-medium leading-relaxed text-zinc-500">
                  Envie os documentos abaixo para concluir seu cadastro e começar a receber corridas depois da aprovação.
                </p>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#F6BE1C]/15 bg-[#F6BE1C]/8 text-[#F6BE1C]">
                <FileCheck2 className="h-8 w-8" strokeWidth={1.8} />
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-[18px] border border-white/5 bg-[#0D0F11] px-4 py-3">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-400">Progresso</span>
              <span className="text-[13px] font-black text-[#F6BE1C]">{completedItems}/4</span>
            </div>

            <div className="space-y-3">
              <div className="rounded-[22px] border border-white/5 bg-[#101214] p-3">
                <div className="mb-2 flex items-center gap-3 px-1">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6BE1C]/10 text-[#F6BE1C]"><UserRound className="h-4.5 w-4.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-white">Foto de perfil</p>
                    <p className="text-[10px] font-medium text-zinc-500">Mostre seu rosto com clareza</p>
                  </div>
                  {selfie ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" /> : null}
                </div>
                <DriverDocumentField id="doc-selfie" label="Selfie" helper="Use a câmera frontal" facing="user" file={selfie} onChange={setSelfie} />
              </div>

              <div className="rounded-[22px] border border-white/5 bg-[#101214] p-3">
                <div className="mb-2 flex items-center gap-3 px-1">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6BE1C]/10 text-[#F6BE1C]"><FileText className="h-4.5 w-4.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-white">CNH</p>
                    <p className="text-[10px] font-medium text-zinc-500">Envie frente e verso dentro deste único item</p>
                  </div>
                  {cnhFront && cnhBack ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" /> : null}
                </div>
                <div className="grid gap-2">
                  <DriverDocumentField id="doc-cnh-front" label="Frente" helper="Foto legível, sem reflexos" file={cnhFront} onChange={setCnhFront} />
                  <DriverDocumentField id="doc-cnh-back" label="Verso" helper="Verso completo da mesma CNH" file={cnhBack} onChange={setCnhBack} />
                </div>
              </div>

              <div className="rounded-[22px] border border-white/5 bg-[#101214] p-3">
                <div className="mb-2 flex items-center gap-3 px-1">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6BE1C]/10 text-[#F6BE1C]"><Car className="h-4.5 w-4.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-white">Documento do veículo (CRLV)</p>
                    <p className="text-[10px] font-medium text-zinc-500">Certificado de Registro e Licenciamento</p>
                  </div>
                  {vehicleDoc ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" /> : null}
                </div>
                <DriverDocumentField id="doc-crlv" label="CRLV" helper="Documento atual do veículo" file={vehicleDoc} onChange={setVehicleDoc} />
              </div>

              <div className="rounded-[22px] border border-white/5 bg-[#101214] p-3">
                <div className="mb-2 flex items-center gap-3 px-1">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6BE1C]/10 text-[#F6BE1C]"><Camera className="h-4.5 w-4.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-white">Foto do veículo</p>
                    <p className="text-[10px] font-medium text-zinc-500">Mostre o veículo por inteiro</p>
                  </div>
                  {vehiclePhoto ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" /> : null}
                </div>
                <DriverDocumentField id="doc-vehicle-photo" label="Veículo" helper="Foto externa, com boa iluminação" file={vehiclePhoto} onChange={setVehiclePhoto} />
              </div>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-[20px] border border-[#F6BE1C]/15 bg-[#F6BE1C]/5 px-4 py-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#F6BE1C]" />
              <div>
                <p className="text-[11px] font-black text-[#F6BE1C]">Seus dados estão protegidos</p>
                <p className="mt-1 text-[10.5px] font-medium leading-relaxed text-zinc-500">
                  Os arquivos ficam privados e são usados apenas para análise e segurança do cadastro.
                </p>
              </div>
            </div>
          </section>

          {error ? (
            <div className="mt-5 flex items-start gap-2 rounded-[18px] border border-red-400/20 bg-red-400/8 px-4 py-3 text-[11.5px] font-semibold text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="mt-6 space-y-3">
            {step < 3 ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#F6BE1C] text-[13px] font-black text-black shadow-[0_18px_38px_-24px_rgba(246,190,28,0.8)]"
              >
                Continuar
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <DSButton
                type="submit"
                size="lg"
                disabled={loading || !allDocsReady}
                className="h-14 w-full rounded-[18px] bg-[#F6BE1C] text-[13px] font-black text-black hover:bg-[#ffd13d] disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando cadastro...</>
                ) : allDocsReady ? (
                  "Finalizar cadastro"
                ) : (
                  `Faltam ${4 - completedItems} item(ns)`
                )}
              </DSButton>
            )}

            <p className="text-center text-[10.5px] font-medium text-zinc-600">
              Já tem cadastro?{" "}
              <Link to="/motorista/login" className="font-black text-[#F6BE1C]">Fazer login</Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
