import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Box, PackageCheck, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { AddressAutocomplete, type PickedAddress } from "@/components/AddressAutocomplete";

type EnviosMode = "enviar" | "receber";

export const Route = createFileRoute("/passageiro/envios")({
  head: () => ({
    meta: [
      { title: "MOVVI Envios — Escolha como usar" },
      {
        name: "description",
        content:
          "Envie ou receba itens com o MOVVI Envios. Rápido, seguro e com preço transparente.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EnviosLanding,
});

function EnviosLanding() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<EnviosMode | null>(null);
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [item, setItem] = useState("");
  const [notes, setNotes] = useState("");

  const labels = useMemo(() => {
    if (mode === "receber") {
      return {
        pickup: "Endereço de coleta",
        pickupHint: "Onde o item será retirado",
        delivery: "Seu endereço de entrega",
        deliveryHint: "Onde você quer receber",
        cta: "Continuar para receber",
      };
    }
    return {
      pickup: "Seu endereço de retirada",
      pickupHint: "Onde o entregador coleta o item",
      delivery: "Endereço de entrega",
      deliveryHint: "Destino da entrega",
      cta: "Continuar para enviar",
    };
  }, [mode]);

  const canContinue = !!mode && pickup.trim().length > 2 && delivery.trim().length > 2;

  const submit = () => {
    if (!mode || !canContinue) return;
    try {
      sessionStorage.setItem(
        "movvi:envios:draft",
        JSON.stringify({ mode, pickup, delivery, item, notes }),
      );
    } catch {}
    navigate({ to: "/passageiro/app", search: { envios: mode } });
  };

  return (
    <div className="min-h-dvh bg-background pb-56">
      <MovviHeader />
      <main className="mx-auto w-full max-w-md space-y-5 px-4 pt-4">
        <header className="space-y-1 px-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Envios MOVVI
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Escolha como deseja usar o serviço.
          </p>
        </header>

        <div className="space-y-3">
          <EnviosOption
            active={mode === "enviar"}
            onClick={() => setMode("enviar")}
            icon={Send}
            title="Enviar"
            description="Enviar um item para outra pessoa."
            hint="Retirada no seu endereço, entrega no destino escolhido."
          />
          <EnviosOption
            active={mode === "receber"}
            onClick={() => setMode("receber")}
            icon={PackageCheck}
            title="Receber"
            description="Receber um item de outro endereço."
            hint="Coleta em outro endereço, entrega no seu."
          />
        </div>

        {mode && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
                <Box className="h-4.5 w-4.5" strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-[15px] font-bold text-foreground">
                  {mode === "enviar" ? "Dados para enviar" : "Dados para receber"}
                </h2>
                <p className="text-[12px] text-muted-foreground">
                  Informe retirada e entrega antes de abrir o mapa.
                </p>
              </div>
            </div>

            <EnviosField
              label={labels.pickup}
              hint={labels.pickupHint}
              value={pickup}
              onChange={setPickup}
              placeholder="Digite rua, número, bairro ou referência"
            />
            <EnviosField
              label={labels.delivery}
              hint={labels.deliveryHint}
              value={delivery}
              onChange={setDelivery}
              placeholder="Digite rua, número, bairro ou referência"
            />
            <EnviosField
              label="Item (opcional)"
              hint="Documento, pacote pequeno, chave, compra..."
              value={item}
              onChange={setItem}
              placeholder="Ex.: envelope com documentos"
            />
            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-semibold text-foreground">Observações</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: retirar na portaria, chamar no interfone."
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </label>
          </section>
        )}

        <p className="px-1 text-[11.5px] leading-snug text-muted-foreground/80">
          MOVVI Envios é indicado para documentos e pequenos volumes. Para
          cargas maiores, use{" "}
          <Link to="/passageiro/mudancas" className="font-semibold text-primary">
            Mudanças / Fretes Grandes
          </Link>
          .
        </p>
      </main>

      {mode && (
        <div
          className="fixed inset-x-0 z-50 border-t border-white/[0.08] bg-[#0B0F17]/95 backdrop-blur-xl"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 78px)" }}
        >
          <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => setMode(null)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white/[0.08] px-4 text-[13px] font-bold text-foreground ring-1 ring-white/10 active:scale-[0.98]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <button
              type="button"
              disabled={!canContinue}
              onClick={submit}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-bold text-primary-foreground disabled:opacity-50 active:scale-[0.98]"
            >
              {labels.cta}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <BottomNav items={PASSENGER_NAV} floating theme="dark" />
    </div>
  );
}

function EnviosOption({
  active,
  onClick,
  icon: Icon,
  title,
  description,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Send;
  title: string;
  description: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-[0_10px_28px_-18px_rgba(0,0,0,0.55)] transition duration-200 ease-out active:scale-[0.98] ${
        active
          ? "border-primary bg-primary/[0.08]"
          : "border-border bg-card hover:border-primary/50"
      }`}
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-bold leading-tight text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground/80">
          {description}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
          {hint}
        </p>
      </div>
      <ArrowRight
        className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        strokeWidth={2}
      />
    </button>
  );
}

function EnviosField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-foreground">{label}</span>
        <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    </label>
  );
}
