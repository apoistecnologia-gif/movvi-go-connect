/**
 * APOIS — Driver Professional Profile Dialog.
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
      <DialogContent
        className="max-h-[92dvh] w-[calc(100vw-24px)] max-w-md min-w-0 overflow-y-auto overscroll-contain bg-card p-4 sm:w-[calc(100vw-32px)] sm:p-6"
        aria-busy={loading}
      >
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words pr-8 text-center text-[15px] font-bold leading-5 tracking-tight">
            Perfil do motorista
          </DialogTitle>
        </DialogHeader>
        <div className="min-w-0">
          <DriverProfessionalProfile profile={data} loading={loading} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
