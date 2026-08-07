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

  const statusLabel = receipt.status.startsWith("cancelada")
    ? "Cancelada"
    : receipt.status === "finalizada"
      ? "Finalizada"
      : receipt.status;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-background sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Recibo da corrida</DialogTitle>
          <DialogDescription>Detalhes da corrida APOIS</DialogDescription>
        </DialogHeader>

        {/* Header */}
        <div className="flex flex-col items-center gap-2 border-b border-border pb-4">
          <MovviLogo size={48} />
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Recibo de corrida
          </p>
        </div>

        {/* Meta */}
        <div className="space-y-2 py-3 text-xs">
          <Row icon={<Hash className="h-3.5 w-3.5" />} label="ID">
            <span className="font-mono">#{receipt.rideId.slice(0, 8).toUpperCase()}</span>
          </Row>
          <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Data">
            {new Date(receipt.date).toLocaleString("pt-BR")}
          </Row>
          <Row label="Status">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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

        {/* Route */}
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{receipt.origin || "Não informado"}</span>
          </p>
          <p className="flex items-start gap-2">
            <Navigation2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{receipt.destination || "Não informado"}</span>
          </p>
        </div>

        {/* People + vehicle */}
        <div className="mt-3 grid gap-2 text-xs">
          {receipt.driverName && (
            <Row label="Motorista">{receipt.driverName}</Row>
          )}
          {receipt.passengerName && (
            <Row label="Passageiro">{receipt.passengerName}</Row>
          )}
          {(receipt.vehicle || receipt.plate) && (
            <Row icon={<Car className="h-3.5 w-3.5" />} label="Veículo">
              {[receipt.vehicle, receipt.plate].filter(Boolean).join(" · ") || "Não informado"}
            </Row>
          )}
          {receipt.paymentMethod && (
            <Row icon={<CreditCard className="h-3.5 w-3.5" />} label="Pagamento">
              {receipt.paymentMethod}
            </Row>
          )}
          {receipt.distanceKm != null && (
            <Row label="Distância">{Number(receipt.distanceKm).toFixed(1)} km</Row>
          )}
          {receipt.durationMin != null && (
            <Row label="Duração">{Math.round(Number(receipt.durationMin))} min</Row>
          )}
        </div>

        {/* Value */}
        {receipt.value != null && (
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 p-4">
            <span className="text-sm font-medium">Valor</span>
            <span className="text-xl font-bold text-primary">{formatBRL(receipt.value)}</span>
          </div>
        )}

        {/* Disclaimer */}
        <p className="mt-4 rounded-xl border border-dashed border-border bg-card/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {APOIS_RECEIPT_DISCLAIMER}
        </p>

        {/* Actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <DSButton variant="outline" onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" /> Copiar
          </DSButton>
          <DSButton onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" /> Compartilhar
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
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
