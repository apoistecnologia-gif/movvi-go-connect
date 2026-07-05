/**
 * MOVVI — Driver proximity alerts (passenger side).
 *
 * Watches the distance between the driver and the passenger's pickup point
 * during `motorista_a_caminho` and fires one-shot alerts (toast + vibration +
 * native Notification when granted) at meaningful thresholds:
 *   - ~2 minutes away (≈ 1.1 km at 32 km/h)  → "Seu motorista chega em 2 min"
 *   - < 400 m                                → "Seu motorista está chegando 🚗"
 *
 * Each threshold fires at most once per ride. State is keyed by rideId so
 * a new ride resets the alerts. No push infra required — uses the browser's
 * local Notification + Vibration APIs, which mobile web apps already have.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";

type Args = {
  rideId: string | null | undefined;
  status: string | null | undefined;
  driverLat: number | null | undefined;
  driverLng: number | null | undefined;
  originLat: number | null | undefined;
  originLng: number | null | undefined;
  driverName?: string | null;
  /** Average urban speed used to convert km → minutes. Defaults to 32 km/h. */
  avgKmh?: number;
};

const TWO_MIN_KM = 1.1;   // ~2 min at 32 km/h
const ARRIVING_KM = 0.4;  // 400 m
const R = 6371;
const toRad = (v: number) => (v * Math.PI) / 180;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dφ = toRad(bLat - aLat);
  const dλ = toRad(bLng - aLng);
  const s =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      (navigator as Navigator & { vibrate: (p: number | number[]) => boolean }).vibrate(pattern);
    }
  } catch { /* noop */ }
}

function nativeNotify(title: string, body: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return; // avoid double alert with toast
    new Notification(title, { body, icon: "/favicon.ico", tag: "movvi-driver-eta" });
  } catch { /* noop */ }
}

export function useDriverProximityAlerts(args: Args): void {
  const {
    rideId, status, driverLat, driverLng, originLat, originLng, driverName, avgKmh = 32,
  } = args;

  const firedRef = useRef<{ rideId: string | null; twoMin: boolean; arriving: boolean }>({
    rideId: null, twoMin: false, arriving: false,
  });

  useEffect(() => {
    if (!rideId) return;
    if (firedRef.current.rideId !== rideId) {
      firedRef.current = { rideId, twoMin: false, arriving: false };
    }
    if (status !== "motorista_a_caminho") return;
    if (
      typeof driverLat !== "number" || typeof driverLng !== "number" ||
      typeof originLat !== "number" || typeof originLng !== "number"
    ) return;

    const km = haversineKm(driverLat, driverLng, originLat, originLng);
    const who = driverName?.split(" ")[0] ?? "Seu motorista";

    if (!firedRef.current.twoMin && km <= TWO_MIN_KM && km > ARRIVING_KM) {
      firedRef.current.twoMin = true;
      const etaMin = Math.max(1, Math.round((km / avgKmh) * 60));
      const title = `${who} chega em ~${etaMin} min 🚗`;
      const body = "Prepare-se para o embarque. Confirme a placa antes de entrar.";
      toast.success(title, { description: body, duration: 6000 });
      vibrate([120, 60, 120]);
      nativeNotify("MOVVI — Motorista chegando", body);
    }

    if (!firedRef.current.arriving && km <= ARRIVING_KM) {
      firedRef.current.arriving = true;
      const title = `${who} está chegando 🎯`;
      const body = "Já pode ir ao ponto de embarque.";
      toast.success(title, { description: body, duration: 8000 });
      vibrate([200, 80, 200, 80, 200]);
      nativeNotify("MOVVI — Motorista chegou perto", body);
    }
  }, [rideId, status, driverLat, driverLng, originLat, originLng, driverName, avgKmh]);
}
