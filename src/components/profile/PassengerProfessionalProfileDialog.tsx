/**
 * APOIS — Passenger Professional Profile Dialog.
 * Modal showing the passenger public trust profile.
 * Used by drivers (tap passenger card) and passengers (own profile preview).
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PassengerProfessionalProfile,
  usePassengerPublicProfile,
} from "./PassengerProfessionalProfile";

export function PassengerProfessionalProfileDialog({
  open,
  onOpenChange,
  passengerUserId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  passengerUserId: string | null;
}) {
  const { data, loading } = usePassengerPublicProfile(open ? passengerUserId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-center text-[15px] font-bold tracking-tight">
            Perfil do passageiro
          </DialogTitle>
        </DialogHeader>
        <PassengerProfessionalProfile profile={data} loading={loading} />
      </DialogContent>
    </Dialog>
  );
}
