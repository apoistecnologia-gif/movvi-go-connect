import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MovviLogo } from "@/components/MovviLogo";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { translateAuthError } from "@/lib/authErrors";
import { cadastrarMotorista } from "@/lib/driverAuth.functions";
import { DriverPhotoField } from "@/components/DriverPhotoField";
import { DriverDocumentField } from "@/components/DriverDocumentField";
import { compressDocumentImage } from "@/lib/imageCompress";

export const Route = createFileRoute("/motorista/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro do Motorista — MOVVI DRIVE" }] }),
  component: DriverSignUpPage,
});

const CATEGORIES = ["carros", "motos", "fretes", "guincho", "envios"] as const;

const schema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(10, "Telefone inválido").max(20),
  password: z.string().min(4, "Mínimo 4 caracteres").max(72),
  cpf: z.string().trim().min(11, "CPF inválido").max(14),
  birth_date: z.string().optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2, "UF com 2 letras"),
  category: z.enum(CATEGORIES),
  vehicle_model: z.string().trim().min(2).max(80),
  vehicle_plate: z.string().trim().min(6).max(10),
  vehicle_color: z.string().trim().min(2).max(40),
  vehicle_year: z.coerce
    .number({ invalid_type_error: "Informe um ano válido." })
    .int({ message: "Informe um ano válido." })
    .superRefine((val, ctx) => {
      if (val < 1971) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O veículo é muito antigo." });
      }
      const maxYear = Math.max(new Date().getFullYear() + 1, 2026);
      if (val > maxYear) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O ano informado é maior que o permitido." });
      }
    }),
});

type DocFile = File | null;

async function fileToBase64(file: File, bucket: string, label: string) {
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

function DriverSignUpPage() {
  const navigate = useNavigate();
  const callCadastrarMotorista = useServerFn(cadastrarMotorista);
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

    const form = new FormData(e.currentTarget);
    const raw = Object.fromEntries(form.entries());
    const parsed = schema.safeParse(raw);
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
      const data = parsed.data;

      console.log("[MOVVI DOCS] arquivos selecionados:", {
        selfie: selfie.name,
        cnhFront: cnhFront.name,
        cnhBack: cnhBack.name,
        veiculo: vehicleDoc.name,
      });

      // Extra safety compression pass (no-op if already compressed).
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

      const result = await callCadastrarMotorista({
        data: {
          ...data,
          email: data.email.toLowerCase(),
          state: data.state.toUpperCase(),
          vehicle_plate: data.vehicle_plate.toUpperCase(),
          documents: documents as [
            typeof documents[0],
            typeof documents[1],
            typeof documents[2],
            typeof documents[3],
          ],
        },
      });

      console.log("[MOVVI DOCS] cadastro concluído:", result);

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email.toLowerCase(),
        password: data.password,
      });
      if (signInError) throw signInError;

      setSuccess(result.message);
      window.setTimeout(() => navigate({ to: "/motorista/status" }), 700);
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2">
            <MovviLogo className="h-8 w-auto" />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/" })}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Sair do cadastro
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Cadastro do Motorista</CardTitle>
            <CardDescription>
              Após enviar, seu cadastro entrará em análise pela equipe MOVVI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-8">
              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase text-primary">Dados pessoais</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input id="name" name="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input id="cpf" name="cpf" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" name="phone" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input id="password" name="password" type="password" required minLength={4} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birth_date">Data de nascimento</Label>
                    <Input id="birth_date" name="birth_date" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" name="city" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">UF</Label>
                    <Input id="state" name="state" maxLength={2} required />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase text-primary">Veículo</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria</Label>
                    <Select name="category" defaultValue="carros">
                      <SelectTrigger id="category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c.charAt(0).toUpperCase() + c.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_model">Modelo</Label>
                    <Input id="vehicle_model" name="vehicle_model" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_plate">Placa</Label>
                    <Input id="vehicle_plate" name="vehicle_plate" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_color">Cor</Label>
                    <Input id="vehicle_color" name="vehicle_color" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_year">Ano</Label>
                    <Input id="vehicle_year" name="vehicle_year" type="number" required />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold uppercase text-primary">Foto de perfil</h3>
                <DriverPhotoField file={selfie} onChange={setSelfie} name={undefined} />
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase text-primary">Documentos</h3>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      allDocsReady
                        ? "bg-primary/15 text-primary ring-primary/30"
                        : "bg-muted text-muted-foreground ring-border"
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {docsUploaded}/4 enviados
                  </span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(docsUploaded / 4) * 100}%` }}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DriverDocumentField
                    id="doc-cnh-front"
                    label="CNH — Frente"
                    helper="Foto legível, sem reflexos"
                    file={cnhFront}
                    onChange={setCnhFront}
                  />
                  <DriverDocumentField
                    id="doc-cnh-back"
                    label="CNH — Verso"
                    helper="Verso completo da CNH"
                    file={cnhBack}
                    onChange={setCnhBack}
                  />
                  <DriverDocumentField
                    id="doc-crlv"
                    label="CRLV do veículo"
                    helper="Documento atual do veículo"
                    file={vehicleDoc}
                    onChange={setVehicleDoc}
                  />
                  <DriverDocumentField
                    id="doc-selfie"
                    label="Selfie de validação"
                    helper="Rosto visível, boa iluminação"
                    facing="user"
                    file={selfie}
                    onChange={setSelfie}
                  />
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Seus documentos ficam privados e são usados apenas para análise da conta.
                </p>
              </section>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Já tem conta?{" "}
                  <Link to="/motorista/login" className="text-primary hover:underline">
                    Entrar
                  </Link>
                </p>
                <Button type="submit" size="lg" disabled={loading || !allDocsReady} className="sm:min-w-48">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...
                    </>
                  ) : allDocsReady ? (
                    "Enviar cadastro"
                  ) : (
                    `Faltam ${4 - docsUploaded} documento(s)`
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
