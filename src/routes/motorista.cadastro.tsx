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
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { translateAuthError } from "@/lib/authErrors";
import { cadastrarMotorista } from "@/lib/driverAuth.functions";
import { DriverPhotoField } from "@/components/DriverPhotoField";

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

type UploadTarget = {
  bucket: "driver-selfies" | "driver-cnh" | "vehicle-documents";
  file: File;
  label: string;
};

async function fileToBase64(t: UploadTarget) {
  const buffer = await t.file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return {
    bucket: t.bucket,
    label: t.label,
    fileName: t.file.name,
    contentType: t.file.type || "application/octet-stream",
    base64: window.btoa(binary),
  };
}

function FileField({
  id,
  label,
  file,
  onChange,
  accept,
}: {
  id: string;
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  accept: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm transition hover:border-primary hover:bg-muted/60"
      >
        <Upload className="h-4 w-4 text-primary" />
        <span className="truncate text-muted-foreground">
          {file ? file.name : "Selecionar arquivo"}
        </span>
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function DriverSignUpPage() {
  const navigate = useNavigate();
  const callCadastrarMotorista = useServerFn(cadastrarMotorista);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selfie, setSelfie] = useState<File | null>(null);
  const [cnh, setCnh] = useState<File | null>(null);
  const [vehicleDoc, setVehicleDoc] = useState<File | null>(null);

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
    if (!selfie) {
      setError("A foto de perfil é obrigatória.");
      return;
    }
    if (!cnh || !vehicleDoc) {
      setError("Envie CNH e documento do veículo");
      return;
    }

    setLoading(true);
    try {
      const data = parsed.data;

      console.log("[MOVVI DOCS] arquivo selecionado:", {
        selfie: selfie.name,
        cnh: cnh.name,
        veiculo: vehicleDoc.name,
      });
      console.log("[MOVVI DOCS] upload iniciado: codificando para envio ao servidor");

      const documents = await Promise.all([
        fileToBase64({ bucket: "driver-selfies", file: selfie, label: "selfie" }),
        fileToBase64({ bucket: "driver-cnh", file: cnh, label: "cnh" }),
        fileToBase64({ bucket: "vehicle-documents", file: vehicleDoc, label: "veiculo" }),
      ]);

      const result = await callCadastrarMotorista({
        data: {
          ...data,
          email: data.email.toLowerCase(),
          state: data.state.toUpperCase(),
          vehicle_plate: data.vehicle_plate.toUpperCase(),
          documents: documents as [typeof documents[0], typeof documents[1], typeof documents[2]],
        },
      });

      console.log("[MOVVI DOCS] upload concluído. resposta do servidor:", result);

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
                <h3 className="text-sm font-semibold uppercase text-primary">Documentos</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FileField
                    id="cnh"
                    label="CNH"
                    accept="image/*,application/pdf"
                    file={cnh}
                    onChange={setCnh}
                  />
                  <FileField
                    id="vehicle_doc"
                    label="Documento do veículo"
                    accept="image/*,application/pdf"
                    file={vehicleDoc}
                    onChange={setVehicleDoc}
                  />
                </div>
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
                <Button type="submit" size="lg" disabled={loading} className="sm:min-w-48">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...
                    </>
                  ) : (
                    "Enviar cadastro"
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
