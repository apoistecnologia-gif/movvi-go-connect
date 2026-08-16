import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shield, Share2, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { SosSheet } from "./SosSheet";
import { IncidentReportSheet } from "./IncidentReportSheet";
import { shareRide, type ShareRideInput } from "@/lib/safety/shareRide";
import { buildTrackingUrl, ensureShareToken } from "@/lib/safety/trackingLink";
import type { SafetyRole } from "@/lib/safety/emergencyContacts";

interface Props {
  role: SafetyRole;
  rideId: string;
  shareInput: ShareRideInput;
  counterpartLabel?: string;
}

export function SafetyCard({ role, rideId, shareInput, counterpartLabel }: Props) {
  const [sosOpen, setSosOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const contactsHref = role === "driver" ? "/motorista/seguranca" : "/passageiro/seguranca";
  const safeRideId = String(rideId ?? "").trim();
  const actionLocked = sharing || sosOpen || reportOpen;

  async function handleShare() {
    if (sharing || !safeRideId) {
      if (!safeRideId) setShareError("Não foi possível identificar esta corrida para compartilhar.");
      return;
    }
    setSharing(true);
    setShareError(null);
    try {
      const token = await ensureShareToken(safeRideId);
      const trackingUrl = token ? buildTrackingUrl(token) : null;
      await shareRide({ ...shareInput, trackingUrl });
    } catch {
      setShareError("Não foi possível compartilhar a corrida agora. Tente novamente.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <section
      className="min-w-0 rounded-2xl bg-background/60 p-3 ring-1 ring-border"
      aria-labelledby="apois-safety-card-title"
      aria-busy={sharing}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/25">
          <Shield className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div id="apois-safety-card-title" className="break-words text-sm font-bold tracking-tight">Segurança APOIS</div>
          <div className="mt-0.5 break-words text-xs leading-4 text-muted-foreground">Compartilhe, denuncie ou acione o SOS.</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 max-[339px]:grid-cols-1">
        <button
          type="button"
          onClick={() => {
            setShareError(null);
            setSosOpen(true);
          }}
          disabled={actionLocked}
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-destructive/12 px-2 py-2.5 text-destructive ring-1 ring-destructive/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive motion-reduce:transform-none"
          aria-label="Abrir opções de emergência SOS"
        >
          <Shield className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-bold">SOS</span>
        </button>
        <button
          type="button"
          onClick={() => void handleShare()}
          disabled={actionLocked || !safeRideId}
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-background/80 px-2 py-2.5 ring-1 ring-border active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transform-none"
          aria-label={sharing ? "Compartilhando corrida" : "Compartilhar corrida"}
          aria-busy={sharing}
        >
          {sharing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
          <span className="text-xs font-semibold">{sharing ? "Compartilhando" : "Compartilhar"}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShareError(null);
            setReportOpen(true);
          }}
          disabled={actionLocked}
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-background/80 px-2 py-2.5 ring-1 ring-border active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transform-none"
          aria-label="Reportar problema de segurança"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-semibold">Reportar</span>
        </button>
      </div>

      {shareError ? (
        <p role="alert" className="mt-2 break-words rounded-xl bg-destructive/10 px-3 py-2 text-xs leading-4 text-destructive ring-1 ring-destructive/25">
          {shareError}
        </p>
      ) : null}

      <Link
        to={contactsHref}
        className="mt-2 flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl bg-background/70 px-3 py-2 text-xs ring-1 ring-border hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="min-w-0 flex-1 break-words text-muted-foreground">Contatos de emergência</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      <SosSheet
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        role={role}
        rideId={safeRideId || null}
        counterpartLabel={counterpartLabel}
      />
      <IncidentReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        role={role}
        rideId={safeRideId}
      />
    </section>
  );
}
