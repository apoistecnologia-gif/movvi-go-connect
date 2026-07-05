import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shield, Share2, AlertTriangle, ChevronRight } from "lucide-react";
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
  const contactsHref = role === "driver" ? "/motorista/seguranca" : "/passageiro/seguranca";

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const token = await ensureShareToken(rideId);
      const trackingUrl = token ? buildTrackingUrl(token) : null;
      await shareRide({ ...shareInput, trackingUrl });
    } finally {
      setSharing(false);
    }
  }


  return (
    <div className="rounded-2xl bg-background/60 p-3 ring-1 ring-border">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/25">
          <Shield className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold tracking-tight">Segurança MOVVI</div>
          <div className="text-[10.5px] text-muted-foreground">Compartilhe, denuncie ou acione o SOS.</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => setSosOpen(true)}
          className="flex flex-col items-center gap-1 rounded-xl bg-destructive/12 py-2.5 text-destructive ring-1 ring-destructive/30 active:scale-[0.98]"
        >
          <Shield className="h-4 w-4" />
          <span className="text-[11px] font-bold">SOS</span>
        </button>
        <button
          onClick={handleShare}
          disabled={sharing}
          className="flex flex-col items-center gap-1 rounded-xl bg-background/80 py-2.5 ring-1 ring-border active:scale-[0.98] disabled:opacity-60"
        >
          <Share2 className="h-4 w-4" />
          <span className="text-[11px] font-semibold">{sharing ? "..." : "Compartilhar"}</span>
        </button>

        <button
          onClick={() => setReportOpen(true)}
          className="flex flex-col items-center gap-1 rounded-xl bg-background/80 py-2.5 ring-1 ring-border active:scale-[0.98]"
        >
          <AlertTriangle className="h-4 w-4" />
          <span className="text-[11px] font-semibold">Reportar</span>
        </button>
      </div>

      <Link
        to={contactsHref}
        className="mt-2 flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-[12px] ring-1 ring-border hover:bg-background"
      >
        <span className="text-muted-foreground">Contatos de emergência</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>

      <SosSheet
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        role={role}
        rideId={rideId}
        counterpartLabel={counterpartLabel}
      />
      <IncidentReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        role={role}
        rideId={rideId}
      />
    </div>
  );
}
