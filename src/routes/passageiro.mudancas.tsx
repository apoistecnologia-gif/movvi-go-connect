import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Box, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { AddressAutocomplete, type PickedAddress } from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/passageiro/mudancas")({
  head: () => ({
    meta: [
      { title: "MOVVI Mudanças / Fretes Grandes — Solicitar" },
      {
        name: "description",
        content:
          "Informe os detalhes da carga para calcularmos o melhor transporte MOVVI.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MudancasFlow,
});

type YesNo = "sim" | "nao";

type LocationInfo = {
  tipo: "casa" | "apartamento" | "";
  andar: string;
  elevador: YesNo | "";
  estacionar: YesNo | "";
  escadas: YesNo | "";
  dificilAcesso: YesNo | "";
  endereco: string;
  coords: { lat: number; lng: number } | null;
};

type MudancasData = {
  tipoServico:
    | "mudanca_residencial"
    | "mudanca_comercial"
    | "frete_grande"
    | "moveis_eletro"
    | "outro"
    | "";
  descricaoCarga: string;
  quantidadeItens: string;
  itemPesado: YesNo | "";
  itemFragil: YesNo | "";
  ajudantes: "nenhum" | "um" | "dois" | "";
  desmontar: YesNo | "";
  embalar: YesNo | "";
  retirada: LocationInfo;
  entrega: LocationInfo;
  veiculo:
    | "utilitario_pequeno"
    | "fiorino_van"
    | "caminhao_pequeno"
    | "caminhao_bau"
    | "auto"
    | "";
  observacoes: string;
};

const initialLoc = (): LocationInfo => ({
  tipo: "",
  andar: "",
  elevador: "",
  estacionar: "",
  escadas: "",
  dificilAcesso: "",
});

const STEP_LABELS = ["Tipo", "Carga", "Retirada", "Entrega", "Revisão"];

function MudancasFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<MudancasData>({
    tipoServico: "",
    descricaoCarga: "",
    quantidadeItens: "",
    itemPesado: "",
    itemFragil: "",
    ajudantes: "",
    desmontar: "",
    embalar: "",
    retirada: initialLoc(),
    entrega: initialLoc(),
    veiculo: "",
    observacoes: "",
  });

  const canAdvance = useMemo(() => {
    if (step === 0) return !!data.tipoServico;
    if (step === 1)
      return (
        data.descricaoCarga.trim().length > 2 &&
        !!data.itemPesado &&
        !!data.itemFragil &&
        !!data.ajudantes &&
        !!data.desmontar &&
        !!data.embalar
      );
    if (step === 2) return !!data.retirada.tipo && !!data.retirada.dificilAcesso;
    if (step === 3) return !!data.entrega.tipo && !!data.entrega.dificilAcesso;
    return true;
  }, [step, data]);

  const submit = () => {
    try {
      sessionStorage.setItem("movvi:mudancas:draft", JSON.stringify(data));
    } catch {}
    navigate({ to: "/passageiro/app", search: { service: "mudanca" } });
  };

  return (
    <div className="min-h-dvh bg-background pb-64">
      <MovviHeader />
      <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
        <header className="space-y-1 px-1">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Box className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                Mudanças MOVVI
              </h1>
              <p className="text-[12.5px] text-muted-foreground">
                Informe os detalhes da carga para calcularmos o melhor
                transporte.
              </p>
            </div>
          </div>
          <StepProgress step={step} labels={STEP_LABELS} />
        </header>

        {step === 0 && (
          <Section title="Tipo de serviço">
            <ChoiceGroup
              label="O que você precisa?"
              value={data.tipoServico}
              onChange={(v) => setData({ ...data, tipoServico: v as MudancasData["tipoServico"] })}
              options={[
                { value: "mudanca_residencial", label: "Mudança residencial" },
                { value: "mudanca_comercial", label: "Mudança comercial" },
                { value: "frete_grande", label: "Frete grande" },
                { value: "moveis_eletro", label: "Móveis / eletrodomésticos" },
                { value: "outro", label: "Outro" },
              ]}
            />
          </Section>
        )}

        {step === 1 && (
          <Section title="Sobre a carga">
            <Field label="O que será transportado?">
              <Textarea
                rows={3}
                value={data.descricaoCarga}
                onChange={(e) => setData({ ...data, descricaoCarga: e.target.value })}
                placeholder="Ex.: geladeira, sofá 3 lugares, 15 caixas."
              />
            </Field>
            <Field label="Quantidade aproximada de itens">
              <Input
                inputMode="numeric"
                value={data.quantidadeItens}
                onChange={(e) => setData({ ...data, quantidadeItens: e.target.value.replace(/\D/g, "") })}
                placeholder="Ex.: 20"
              />
            </Field>
            <YN label="Tem item pesado?" value={data.itemPesado} set={(v) => setData({ ...data, itemPesado: v })} />
            <YN label="Tem item frágil?" value={data.itemFragil} set={(v) => setData({ ...data, itemFragil: v })} />
            <ChoiceGroup
              label="Precisa de ajudante?"
              value={data.ajudantes}
              onChange={(v) => setData({ ...data, ajudantes: v as MudancasData["ajudantes"] })}
              options={[
                { value: "nenhum", label: "Não" },
                { value: "um", label: "1 ajudante" },
                { value: "dois", label: "2 ajudantes" },
              ]}
            />
            <YN label="Precisa desmontar / montar móveis?" value={data.desmontar} set={(v) => setData({ ...data, desmontar: v })} />
            <YN label="Precisa embalar itens?" value={data.embalar} set={(v) => setData({ ...data, embalar: v })} />
            <ChoiceGroup
              label="Preferência de veículo"
              value={data.veiculo}
              onChange={(v) => setData({ ...data, veiculo: v as MudancasData["veiculo"] })}
              options={[
                { value: "utilitario_pequeno", label: "Utilitário pequeno" },
                { value: "fiorino_van", label: "Fiorino / van" },
                { value: "caminhao_pequeno", label: "Caminhão pequeno" },
                { value: "caminhao_bau", label: "Caminhão baú" },
                { value: "auto", label: "Escolher automaticamente" },
              ]}
            />
          </Section>
        )}

        {step === 2 && (
          <LocationSection
            title="Local de retirada"
            value={data.retirada}
            onChange={(v) => setData({ ...data, retirada: v })}
          />
        )}

        {step === 3 && (
          <LocationSection
            title="Local de entrega"
            value={data.entrega}
            onChange={(v) => setData({ ...data, entrega: v })}
          />
        )}

        {step === 4 && (
          <Section title="Revisão">
            <ReviewRow k="Tipo de serviço" v={data.tipoServico || "—"} />
            <ReviewRow k="Carga" v={data.descricaoCarga || "—"} />
            {data.quantidadeItens && <ReviewRow k="Quantidade" v={data.quantidadeItens} />}
            <ReviewRow k="Itens pesados" v={data.itemPesado || "—"} />
            <ReviewRow k="Itens frágeis" v={data.itemFragil || "—"} />
            <ReviewRow k="Ajudantes" v={data.ajudantes || "—"} />
            <ReviewRow k="Desmontar/Montar" v={data.desmontar || "—"} />
            <ReviewRow k="Embalar" v={data.embalar || "—"} />
            <ReviewRow k="Veículo" v={data.veiculo || "—"} />
            <ReviewRow k="Retirada" v={locSummary(data.retirada)} />
            <ReviewRow k="Entrega" v={locSummary(data.entrega)} />
            <Field label="Observações adicionais">
              <Textarea
                rows={3}
                value={data.observacoes}
                onChange={(e) => setData({ ...data, observacoes: e.target.value })}
                placeholder="Ex.: prefiro atendimento pela manhã."
              />
            </Field>
            <p className="pt-2 text-[12px] text-muted-foreground">
              Ao continuar, você define os endereços de retirada e entrega no
              mapa e confirma o valor.
            </p>
          </Section>
        )}
      </main>

      <div
        className="fixed inset-x-0 z-50 border-t border-white/[0.08] bg-[#0B0F17]/95 backdrop-blur-xl"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 78px)" }}
      >
        <div
          className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-3"
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
              Solicitar mudança
            </Button>
          )}
        </div>
      </div>
      <BottomNav items={PASSENGER_NAV} floating theme="dark" />
    </div>
  );
}

/* ---------- location section ---------- */

function LocationSection({
  title,
  value,
  onChange,
}: {
  title: string;
  value: LocationInfo;
  onChange: (v: LocationInfo) => void;
}) {
  const set = <K extends keyof LocationInfo>(k: K, v: LocationInfo[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <Section title={title}>
      <ChoiceGroup
        label="Tipo do local"
        value={value.tipo}
        onChange={(v) => set("tipo", v as LocationInfo["tipo"])}
        options={[
          { value: "casa", label: "Casa" },
          { value: "apartamento", label: "Apartamento" },
        ]}
      />
      {value.tipo === "apartamento" && (
        <>
          <YN label="Tem elevador?" value={value.elevador} set={(v) => set("elevador", v)} />
          <Field label="Qual andar?">
            <Input
              inputMode="numeric"
              value={value.andar}
              onChange={(e) => set("andar", e.target.value.replace(/\D/g, ""))}
              placeholder="Ex.: 5"
            />
          </Field>
        </>
      )}
      <YN label="Dá para estacionar perto?" value={value.estacionar} set={(v) => set("estacionar", v)} />
      <YN label="Há escadas?" value={value.escadas} set={(v) => set("escadas", v)} />
      <YN label="Local de difícil acesso?" value={value.dificilAcesso} set={(v) => set("dificilAcesso", v)} />
      <p className="text-[12px] text-muted-foreground">
        O endereço exato será definido no mapa MOVVI na próxima tela.
      </p>
    </Section>
  );
}

function locSummary(l: LocationInfo): string {
  if (!l.tipo) return "—";
  const parts: string[] = [l.tipo === "casa" ? "Casa" : "Apartamento"];
  if (l.tipo === "apartamento") {
    if (l.andar) parts.push(`${l.andar}º`);
    if (l.elevador) parts.push(l.elevador === "sim" ? "com elevador" : "sem elevador");
  }
  if (l.dificilAcesso === "sim") parts.push("difícil acesso");
  return parts.join(" · ");
}

/* ---------- primitives (mirror of guincho page) ---------- */

function StepProgress({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="mt-2 flex items-center gap-1">
      {labels.map((l, i) => (
        <div key={l} className="flex-1">
          <div className={`h-1.5 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-white/[0.08]"}`} />
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
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
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

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0 last:pb-0">
      <span className="text-[12.5px] font-semibold text-muted-foreground">{k}</span>
      <span className="max-w-[60%] text-right text-[13px] font-medium text-foreground">{v}</span>
    </div>
  );
}
