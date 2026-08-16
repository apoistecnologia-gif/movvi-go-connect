import { Copy, Share2, MapPin, Navigation2, Car, CreditCard, Calendar, Hash } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MovviLogo } from "@/components/MovviLogo";
import {
  copyReceipt,
  formatBRL,
  shareReceipt,
  APOIS_RECEIPT_DISCLAIMER,
  type ReceiptData,
} from "@/lib/rideReceipt";
import { DSButton } from "@/design-system";

function readableStatus(status: string): string {
  if (status.startsWith("cancelada") || status === "cancelado") return "Cancelada";
  if (status === "finalizada") return "Finalizada";
  if (status === "em_viagem" || status === "em_andamento") return "Em andamento";
  if (status === "motorista_chegou") return "Motorista chegou";
  if (status === "motorista_a_caminho") return "Motorista a caminho";
  if (status === "procurar_motorista" || status === "buscando_motorista") return "Buscando motorista";
  return "Corrida atualizada";
}

function readablePaymentMethod(method: string): string {
  const normalized = method.trim().toLowerCase();
  if (normalized.includes("pix")) return "Pix";
  if (normalized.includes("cash") || normalized.includes("dinheiro")) return "Dinheiro";
  if (normalized.includes("credit") || normalized.includes("credito")) return "Cartão de crédito";
  if (normalized.includes("debit") || normalized.includes("debito")) return "Cartão de débito";
  if (normalized.includes("wallet") || normalized.includes("carteira")) return "Carteira APOIS";
  return "Forma de pagamento registrada";
}

export function RideReceiptDialog({
  open,
  onOpenChange,
  receipt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  receipt: ReceiptData | null;
}) {
  if (!receipt) return null;

  async function handleShare() {
    try {
      const result = await shareReceipt(receipt!);
      toast.success(result === "shared" ? "Recibo compartilhado" : "Recibo copiado");
    } catch {
      toast.error("Não foi possível compartilhar");
    }
  }

  async function handleCopy() {
    try {
      await copyReceipt(receipt!);
      toast.success("Detalhes copiados");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  const statusLabel = readableStatus(receipt.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-24px)] max-w-md overflow-y-auto bg-background px-4 sm:px-6"
        style={{
          maxHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px)",
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Recibo da corrida</DialogTitle>
          <DialogDescription>Detalhes da corrida APOIS</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col items-center gap-2 border-b border-border pb-4 text-center">
          <MovviLogo size={48} />
          <p className="break-words text-xs uppercase tracking-wider text-muted-foreground">
            Recibo de corrida
          </p>
        </div>

        <div className="min-w-0 space-y-2 py-3 text-xs">
          <Row icon={<Hash className="h-3.5 w-3.5" aria-hidden="true" />} label="ID">
            <span className="font-mono">#{receipt.rideId.slice(0, 8).toUpperCase()}</span>
          </Row>
          <Row icon={<Calendar className="h-3.5 w-3.5" aria-hidden="true" />} label="Data">
            {new Date(receipt.date).toLocaleString("pt-BR")}
          </Row>
          <Row label="Status">
            <span
              className={`max-w-full rounded-full px-2 py-1 text-center text-[10px] font-semibold leading-4 ${
                receipt.status === "finalizada"
                  ? "bg-primary/15 text-primary"
                  : receipt.status.startsWith("cancelada")
                    ? "bg-destructive/15 text-destructive"
                    : "bg-secondary/40"
              }`}
            >
              {statusLabel}
            </span>
          </Row>
        </div>

        <div className="min-w-0 space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="flex min-w-0 items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{receipt.origin || "Não informado"}</span>
          </p>
          <p className="flex min-w-0 items-start gap-2">
            <Navigation2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{receipt.destination || "Não informado"}</span>
          </p>
        </div>

        <div className="mt-3 grid min-w-0 gap-2 text-xs">
          {receipt.driverName && <Row label="Motorista">{receipt.driverName}</Row>}
          {receipt.passengerName && <Row label="Passageiro">{receipt.passengerName}</Row>}
          {(receipt.vehicle || receipt.plate) && (
            <Row icon={<Car className="h-3.5 w-3.5" aria-hidden="true" />} label="Veículo">
              {[receipt.vehicle, receipt.plate].filter(Boolean).join(" · ") || "Não informado"}
            </Row>
          )}
          {receipt.paymentMethod && (
            <Row icon={<CreditCard className="h-3.5 w-3.5" aria-hidden="true" />} label="Pagamento">
              {readablePaymentMethod(receipt.paymentMethod)}
            </Row>
          )}
          {receipt.distanceKm != null && <Row label="Distância">{Number(receipt.distanceKm).toFixed(1).replace(".", ",")} km</Row>}
          {receipt.durationMin != null && <Row label="Duração">{Math.round(Number(receipt.durationMin))} min</Row>}
        </div>

        {receipt.value != null && (
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-4 max-[339px]:items-start">
            <span className="text-sm font-medium">Valor</span>
            <span className="max-w-full break-words text-xl font-bold tabular-nums text-primary">{formatBRL(receipt.value)}</span>
          </div>
        )}

        <p className="mt-4 min-w-0 rounded-xl border border-dashed border-border bg-card/40 p-3 text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {APOIS_RECEIPT_DISCLAIMER}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <DSButton variant="outline" onClick={handleCopy} className="min-h-11 min-w-0">
            <Copy className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> <span className="break-words">Copiar</span>
          </DSButton>
          <DSButton onClick={handleShare} className="min-h-11 min-w-0">
            <Share2 className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> <span className="break-words">Compartilhar</span>
          </DSButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 max-[339px]:flex-col">
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="min-w-0 max-w-full break-words text-right font-medium [overflow-wrap:anywhere] max-[339px]:text-left">{children}</span>
    </div>
  );
}