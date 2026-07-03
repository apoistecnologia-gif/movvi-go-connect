/**
 * MOVVI — Driver Professional Profile Dialog.
 * Modal that shows the driver public trust profile.
 * Used by passengers (tap driver card) and drivers (own profile preview).
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DriverProfessionalProfile,
  useDriverPublicProfile,
} from "./DriverProfessionalProfile";

export function DriverProfessionalProfileDialog({
  open,
  onOpenChange,
  driverUserId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driverUserId: string | null;
}) {
  const { data, loading } = useDriverPublicProfile(open ? driverUserId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-center text-[15px] font-bold tracking-tight">
            Perfil do motorista
          </DialogTitle>
        </DialogHeader>
        <DriverProfessionalProfile profile={data} loading={loading} />
      </DialogContent>
    </Dialog>
  );
}
