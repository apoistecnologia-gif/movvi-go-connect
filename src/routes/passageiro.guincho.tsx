import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { MovviHeader } from "@/components/MovviHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/passageiro/guincho")({
  head: () => ({
    meta: [
      { title: "MOVVI Guincho — Solicitar" },
      {
        name: "description",
        content:
          "Conte como está o veículo para encontrarmos o atendimento de guincho ideal.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GuinchoFlow,
});

type YesNo = "sim" | "nao";
type YesNoUnknown = YesNo | "nao_sei";

type GuinchoData = {
  tipoVeiculo: "carro" | "moto" | "utilitario" | "caminhonete" | "outro" | "";
  marcaModelo: string;
  placa: string;
  veiculoNoLocal: YesNo | "";
  chaveNoLocal: YesNo | "";
  veiculoLiga: YesNoUnknown | "";
  rodasTravadas: YesNoUnknown | "";
  dificilAcesso: YesNo | "";
  garagemSubsolo: YesNo | "";
  viaPublica: YesNo | "";
  acidente: YesNo | "";
  precisaPlataforma: YesNoUnknown | "";
  observacoes: string;
};

const STEP_LABELS = ["Veículo", "Situação", "Endereços", "Revisão"];

function GuinchoFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<GuinchoData>({
    tipoVeiculo: "",
    marcaModelo: "",
    placa: "",
    veiculoNoLocal: "",
    chaveNoLocal: "",
    veiculoLiga: "",
    rodasTravadas: "",
    dificilAcesso: "",
    garagemSubsolo: "",
    viaPublica: "",
    acidente: "",
    precisaPlataforma: "",
    observacoes: "",
  });

  const canAdvance = useMemo(() => {
    if (step === 0) return !!data.tipoVeiculo && data.marcaModelo.trim().length > 1;
    if (step === 1)
      return !!data.veiculoNoLocal && !!data.chaveNoLocal && !!data.veiculoLiga && !!data.precisaPlataforma;
    return true;
  }, [step, data]);

  const submit = () => {
    try {
      sessionStorage.setItem("movvi:guincho:draft", JSON.stringify(data));
    } catch {}
    navigate({ to: "/passageiro/app", search: { service: "guincho" } });
  };

  return (
    <div className="min-h-dvh bg-background pb-40">
      <MovviHeader />
      <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
        <header className="space-y-1 px-1">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Truck className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                Guincho MOVVI
              </h1>
              <p className="text-[12.5px] text-muted-foreground">
                Conte como está o veículo para encontrarmos o atendimento ideal.
              </p>
            </div>
          </div>
          <StepProgress step={step} labels={STEP_LABELS} />
        </header>

        {step === 0 && (
          <Section title="Sobre o veículo">
            <ChoiceGroup
              label="Tipo de veículo"
              value={data.tipoVeiculo}
              onChange={(v) => setData({ ...data, tipoVeiculo: v as GuinchoData["tipoVeiculo"] })}
              options={[
                { value: "carro", label: "Carro" },
                { value: "moto", label: "Moto" },
                { value: "utilitario", label: "Utilitário" },
                { value: "caminhonete", label: "Caminhonete" },
                { value: "outro", label: "Outro" },
              ]}
            />
            <Field label="Marca e modelo">
              <Input
                value={data.marcaModelo}
                onChange={(e) => setData({ ...data, marcaModelo: e.target.value })}
                placeholder="Ex.: Fiat Palio, Honda CG 160"
              />
            </Field>
            <Field label="Placa (opcional)">
              <Input
                value={data.placa}
                onChange={(e) => setData({ ...data, placa: e.target.value.toUpperCase() })}
                placeholder="ABC1D23"
                maxLength={8}
              />
            </Field>
          </Section>
        )}

        {step === 1 && (
          <Section title="Situação do veículo">
            <YN label="O veículo está no local?" value={data.veiculoNoLocal} set={(v) => setData({ ...data, veiculoNoLocal: v })} />
            <YN label="A chave do veículo está no local?" value={data.chaveNoLocal} set={(v) => setData({ ...data, chaveNoLocal: v })} />
            <YNU label="O veículo liga?" value={data.veiculoLiga} set={(v) => setData({ ...data, veiculoLiga: v })} />
            <YNU label="O veículo está com rodas travadas?" value={data.rodasTravadas} set={(v) => setData({ ...data, rodasTravadas: v })} />
            <YN label="Local de difícil acesso?" value={data.dificilAcesso} set={(v) => setData({ ...data, dificilAcesso: v })} />
            <YN label="Está em garagem ou subsolo?" value={data.garagemSubsolo} set={(v) => setData({ ...data, garagemSubsolo: v })} />
            <YN label="Está em via pública?" value={data.viaPublica} set={(v) => setData({ ...data, viaPublica: v })} />
            <YN label="O veículo sofreu acidente?" value={data.acidente} set={(v) => setData({ ...data, acidente: v })} />
            <YNU label="Precisa de plataforma?" value={data.precisaPlataforma} set={(v) => setData({ ...data, precisaPlataforma: v })} />
          </Section>
        )}

        {step === 2 && (
          <Section title="Endereços">
            <p className="text-[12.5px] text-muted-foreground">
              Você vai definir o local do veículo e o destino na próxima tela,
              pelo mapa MOVVI. Aqui você pode deixar observações que ajudem o
              motorista guincheiro.
            </p>
            <Field label="Observações adicionais">
              <Textarea
                rows={4}
                value={data.observacoes}
                onChange={(e) => setData({ ...data, observacoes: e.target.value })}
                placeholder="Ex.: veículo está no 2º subsolo do edifício, vaga 42."
              />
            </Field>
          </Section>
        )}

        {step === 3 && (
          <Section title="Revisão">
            <ReviewRow k="Tipo de veículo" v={data.tipoVeiculo || "—"} />
            <ReviewRow k="Marca/modelo" v={data.marcaModelo || "—"} />
            {data.placa && <ReviewRow k="Placa" v={data.placa} />}
            <ReviewRow k="Veículo no local" v={data.veiculoNoLocal || "—"} />
            <ReviewRow k="Chave no local" v={data.chaveNoLocal || "—"} />
            <ReviewRow k="Liga" v={data.veiculoLiga || "—"} />
            <ReviewRow k="Rodas travadas" v={data.rodasTravadas || "—"} />
            <ReviewRow k="Difícil acesso" v={data.dificilAcesso || "—"} />
            <ReviewRow k="Garagem/subsolo" v={data.garagemSubsolo || "—"} />
            <ReviewRow k="Via pública" v={data.viaPublica || "—"} />
            <ReviewRow k="Acidente" v={data.acidente || "—"} />
            <ReviewRow k="Precisa plataforma" v={data.precisaPlataforma || "—"} />
            {data.observacoes && <ReviewRow k="Observações" v={data.observacoes} />}
            <p className="pt-2 text-[12px] text-muted-foreground">
              Ao continuar, você vai definir o local do veículo e o destino no
              mapa e confirmar o valor do guincho.
            </p>
          </Section>
        )}
      </main>

      {/* Barra fixa de ação */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0B0F17]/95 backdrop-blur-xl">
        <div
          className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-11 shrink-0"
            onClick={() => (step === 0 ? navigate({ to: "/passageiro/servicos" }) : setStep(step - 1))}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {step < STEP_LABELS.length - 1 ? (
            <Button
              type="button"
              size="lg"
              className="h-11 flex-1"
              disabled={!canAdvance}
              onClick={() => setStep(step + 1)}
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" size="lg" className="h-11 flex-1" onClick={submit}>
              <Check className="h-4 w-4" />
              Solicitar guincho
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- primitives ---------- */

function StepProgress({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="mt-2 flex items-center gap-1">
      {labels.map((l, i) => (
        <div key={l} className="flex-1">
          <div
            className={`h-1.5 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-white/[0.08]"
            }`}
          />
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {i + 1}. {l}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12.5px] font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1 transition ${
                active
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-white/[0.04] text-foreground ring-border hover:bg-white/[0.08]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function YN({ label, value, set }: { label: string; value: YesNo | ""; set: (v: YesNo) => void }) {
  return (
    <ChoiceGroup<YesNo>
      label={label}
      value={value}
      onChange={set}
      options={[
        { value: "sim", label: "Sim" },
        { value: "nao", label: "Não" },
      ]}
    />
  );
}

function YNU({
  label,
  value,
  set,
}: {
  label: string;
  value: YesNoUnknown | "";
  set: (v: YesNoUnknown) => void;
}) {
  return (
    <ChoiceGroup<YesNoUnknown>
      label={label}
      value={value}
      onChange={set}
      options={[
        { value: "sim", label: "Sim" },
        { value: "nao", label: "Não" },
        { value: "nao_sei", label: "Não sei" },
      ]}
    />
  );
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0 last:pb-0">
      <span className="text-[12.5px] font-semibold text-muted-foreground">{k}</span>
      <span className="max-w-[60%] text-right text-[13px] font-medium text-foreground">{v}</span>
    </div>
  );
}
