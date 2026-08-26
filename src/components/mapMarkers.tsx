/**
 * APOIS — Marcadores premium do mapa.
 * Apresentação apenas: não altera dispatch, GPS, realtime ou regras de corrida.
 */
import { Marker } from "@react-google-maps/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { isBrazilCoordinate, safePoint, safeSymbol } from "@/lib/googleMaps";

type LatLng = { lat: number; lng: number };

const PIN_PATH = "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z";
const CAR_BODY_PATH = "M -5.2 -10.5 C -6 -10.5 -6.4 -9.8 -6.4 -9 L -6.4 9 C -6.4 10.2 -5.6 11 -4.4 11 L 4.4 11 C 5.6 11 6.4 10.2 6.4 9 L 6.4 -9 C 6.4 -9.8 6 -10.5 5.2 -10.5 C 4 -11 2.2 -11.2 0 -11.2 C -2.2 -11.2 -4 -11 -5.2 -10.5 Z";
const CAR_WINDSHIELD_PATH = "M -4.2 -1 L 4.2 -1 L 3.6 -5 L -3.6 -5 Z";
const CAR_REAR_GLASS_PATH = "M -4.2 4 L 4.2 4 L 3.6 8 L -3.6 8 Z";
const APOIS_RED = "#E4232C";
const CAR_OUTLINE = "#3a0509";
const GLASS_DARK = "#0d1119";

function validPosition(position: LatLng | null | undefined): position is LatLng {
  return Boolean(position && Number.isFinite(position.lat) && Number.isFinite(position.lng) && isBrazilCoordinate(position.lat, position.lng));
}

function safeHeading(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

function safeScale(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(3, Math.max(0.6, n)) : fallback;
}

function safeOpacity(value: unknown, fallback = 1): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

function safeZ(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(Math.min(2_000_000_000, Math.max(-2_000_000_000, n))) : fallback;
}

function safeColor(value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  return raw && /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\()/i.test(raw) ? raw : fallback;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  return reduced;
}

function CarShape({ position, heading = 0, scale = 1.6, bodyColor = APOIS_RED, outlineColor = CAR_OUTLINE, opacity = 1, zBase = 10000 }: {
  position: LatLng;
  heading?: number;
  scale?: number;
  bodyColor?: string;
  accentColor?: string;
  outlineColor?: string;
  opacity?: number;
  zBase?: number;
}) {
  if (!validPosition(position)) return null;
  const rot = safeHeading(heading);
  const safeCarScale = safeScale(scale, 1.6);
  const safeBody = safeColor(bodyColor, APOIS_RED);
  const safeOutline = safeColor(outlineColor, CAR_OUTLINE);
  const safeAlpha = safeOpacity(opacity);
  const safeBase = safeZ(zBase, 10000);
  const anchor0 = safePoint(0, 0);
  return <>
    <Marker position={position} clickable={false} zIndex={safeBase - 3} opacity={safeAlpha * 0.45} icon={{ path: safeSymbol("CIRCLE"), scale: 10 * (safeCarScale / 1.6), fillColor: "#000000", fillOpacity: 0.5, strokeWeight: 0 }} />
    <Marker position={position} clickable={false} zIndex={safeBase} opacity={safeAlpha} icon={{ path: CAR_BODY_PATH, fillColor: safeBody, fillOpacity: 1, strokeColor: safeOutline, strokeOpacity: 1, strokeWeight: 1.3, scale: safeCarScale, rotation: rot, anchor: anchor0 }} />
    <Marker position={position} clickable={false} zIndex={safeBase + 2} opacity={safeAlpha} icon={{ path: CAR_WINDSHIELD_PATH, fillColor: GLASS_DARK, fillOpacity: 0.95, strokeColor: safeOutline, strokeOpacity: 0.9, strokeWeight: 0.5, scale: safeCarScale, rotation: rot, anchor: anchor0 }} />
    <Marker position={position} clickable={false} zIndex={safeBase + 3} opacity={safeAlpha} icon={{ path: CAR_REAR_GLASS_PATH, fillColor: GLASS_DARK, fillOpacity: 0.9, strokeColor: safeOutline, strokeOpacity: 0.85, strokeWeight: 0.5, scale: safeCarScale, rotation: rot, anchor: anchor0 }} />
  </>;
}

function useRipple(period = 1800, offset = 0) {
  const [phase, setPhase] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame !== "function") {
      setPhase(0);
      return;
    }
    const safePeriod = Number.isFinite(period) && period >= 600 ? Math.min(10000, period) : 1800;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.min(safePeriod, offset)) : 0;
    let raf = 0;
    const start = performance.now() - safeOffset;
    const step = (now: number) => {
      setPhase(((now - start) % safePeriod) / safePeriod);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [period, offset, reduced]);
  return phase;
}

export function PassengerLocationMarker({ position, color = "#3b82f6" }: { position: LatLng; color?: string }) {
  const p1 = useRipple(1800, 0);
  const p2 = useRipple(1800, 900);
  if (!validPosition(position)) return null;
  const safeMarkerColor = safeColor(color, "#3b82f6");
  const ring = (t: number, z: number) => {
    const phase = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
    const ringScale = 8 + phase * 16;
    const opacity = (1 - phase) * 0.28;
    return <Marker position={position} clickable={false} zIndex={z} icon={{ path: safeSymbol("CIRCLE"), scale: ringScale, fillColor: safeMarkerColor, fillOpacity: opacity * 0.5, strokeColor: safeMarkerColor, strokeOpacity: opacity, strokeWeight: 1.5 }} />;
  };
  return <>
    {ring(p1, 9995)}{ring(p2, 9996)}
    <Marker position={position} clickable={false} zIndex={9998} icon={{ path: safeSymbol("CIRCLE"), scale: 9, fillColor: "#000000", fillOpacity: 0.16, strokeWeight: 0 }} />
    <Marker position={position} clickable={false} zIndex={9999} icon={{ path: safeSymbol("CIRCLE"), scale: 8, fillColor: safeMarkerColor, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 }} />
  </>;
}

export function PlacePinMarker({ position, color, zIndexBase = 9990 }: { position: LatLng; color: string; zIndexBase?: number }) {
  if (!validPosition(position)) return null;
  const safePinColor = safeColor(color, "#2563eb");
  const base = safeZ(zIndexBase, 9990);
  return <>
    <Marker position={position} clickable={false} zIndex={base} icon={{ path: safeSymbol("CIRCLE"), scale: 10, fillColor: safePinColor, fillOpacity: 0.1, strokeColor: safePinColor, strokeOpacity: 0.25, strokeWeight: 1 }} />
    <Marker position={position} clickable={false} zIndex={base + 1} icon={{ path: safeSymbol("CIRCLE"), scale: 5, fillColor: "#000000", fillOpacity: 0.2, strokeWeight: 0, anchor: safePoint(0, -2) }} />
    <Marker position={position} clickable={false} zIndex={base + 2} icon={{ path: PIN_PATH, fillColor: safePinColor, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, scale: 1.7, anchor: safePoint(12, 22) }} />
  </>;
}

export function InterpolatedDriverMarker({ position, heading, color = "#2563eb", scale = 1.7 }: { position: LatLng; heading?: number | null; color?: string; scale?: number }) {
  const initialPosition = validPosition(position) ? position : { lat: -15.793889, lng: -47.882778 };
  const initialHeading = safeHeading(heading);
  const [display, setDisplay] = useState<LatLng>(initialPosition);
  const [displayHeading, setDisplayHeading] = useState<number>(initialHeading);
  const rafRef = useRef<number | null>(null);
  const displayRef = useRef({ pos: initialPosition, heading: initialHeading });
  const reduced = useReducedMotion();
  const safeDriverColor = safeColor(color, "#2563eb");
  const safeDriverScale = safeScale(scale, 1.7);

  useEffect(() => { displayRef.current = { pos: display, heading: displayHeading }; }, [display, displayHeading]);

  useEffect(() => {
    if (!validPosition(position)) return;
    const targetHeading = heading == null ? displayRef.current.heading : safeHeading(heading);
    let delta = targetHeading - safeHeading(displayRef.current.heading);
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    const from = { pos: displayRef.current.pos, heading: displayRef.current.heading };
    const to = { pos: position, heading: from.heading + delta };

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (reduced || typeof requestAnimationFrame !== "function") {
      setDisplay(to.pos);
      setDisplayHeading(safeHeading(to.heading));
      return;
    }

    const startedAt = performance.now();
    const duration = 900;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      const lat = from.pos.lat + (to.pos.lat - from.pos.lat) * eased;
      const lng = from.pos.lng + (to.pos.lng - from.pos.lng) * eased;
      const nextHeading = from.heading + (to.heading - from.heading) * eased;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        rafRef.current = null;
        return;
      }
      setDisplay({ lat, lng });
      setDisplayHeading(safeHeading(nextHeading));
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [position.lat, position.lng, heading, reduced]);

  if (!validPosition(position) || !validPosition(display)) return null;
  return <>
    <Marker position={display} clickable={false} zIndex={9997} icon={{ path: safeSymbol("CIRCLE"), scale: 15, fillColor: safeDriverColor, fillOpacity: 0.1, strokeColor: safeDriverColor, strokeOpacity: 0.28, strokeWeight: 1.2 }} />
    <CarShape position={display} heading={displayHeading} scale={safeDriverScale} bodyColor={safeDriverColor} outlineColor="#090A0B" zBase={10000} />
  </>;
}

export function NearbyDriverMarker({ position, dimmed = false }: { position: LatLng; dimmed?: boolean }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(reduced);
  useEffect(() => {
    if (reduced || typeof requestAnimationFrame !== "function") {
      setMounted(true);
      return;
    }
    setMounted(false);
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [position.lat, position.lng, reduced]);
  if (!validPosition(position)) return null;
  const opacity = dimmed ? 0.55 : 1;
  const scale = dimmed ? 1.05 : 1.35;
  const fade = mounted ? 1 : 0;
  return <>
    {!dimmed && <Marker position={position} clickable={false} zIndex={9994} opacity={fade} icon={{ path: safeSymbol("CIRCLE"), scale: 14, fillColor: "#8DD92B", fillOpacity: 0.08, strokeColor: "#8DD92B", strokeOpacity: 0.22, strokeWeight: 1 }} />}
    <CarShape position={position} heading={0} scale={scale} opacity={opacity * fade} zBase={9996} />
  </>;
}
