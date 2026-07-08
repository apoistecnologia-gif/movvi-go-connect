/**
 * MOVVI DRIVE — Marcadores premium do mapa.
 *
 * Componentes visuais reutilizados no app do passageiro e do motorista.
 * NÃO alteram nenhuma lógica de corrida, dispatch, GPS ou realtime — são
 * puramente apresentação: sombra suave, pulso, glow, interpolação de
 * posição/heading para movimento fluido tipo Uber/99/InDrive.
 */

import { Marker } from "@react-google-maps/api";
import { useEffect, useRef, useState } from "react";
import { safePoint, safeSymbol } from "@/lib/googleMaps";

type LatLng = { lat: number; lng: number };

/* Top-down car silhouette. Centered on (0,0), front pointing "up" (−Y).
 * Bounding box ≈ 12×20. Designed original for MOVVI — smooth capsule body
 * with slight nose taper, no brand references. */
const CAR_BODY_PATH =
  "M -5 -9 C -5.7 -9 -6 -8.4 -6 -7.4 L -6 7.4 C -6 8.4 -5.7 9 -5 9 L 5 9 C 5.7 9 6 8.4 6 7.4 L 6 -7.4 C 6 -8.4 5.7 -9 5 -9 Z";
/* Cabin/roof accent — rounded rectangle. Painted in MOVVI lime. */
const CAR_CABIN_PATH =
  "M -3.2 -2.4 Q -3.7 -2.4 -3.7 -1.9 L -3.7 3.2 Q -3.7 3.7 -3.2 3.7 L 3.2 3.7 Q 3.7 3.7 3.7 3.2 L 3.7 -1.9 Q 3.7 -2.4 3.2 -2.4 Z";
/* Windshield hint — small dark trapezoid on the front of the cabin. */
const CAR_WINDSHIELD_PATH =
  "M -3.2 -2.4 L 3.2 -2.4 L 2.4 -0.6 L -2.4 -0.6 Z";
const PIN_PATH =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z";

const MOVVI_GREEN = "#8DD92B";
const CAR_OUTLINE = "#0B0F1A";

/* Layered top-down car. Renders 4 stacked Markers: soft ground shadow,
 * white body with dark stroke, green cabin, and a subtle windshield.
 * All layers share the same position + rotation, so heading updates
 * remain visually coherent. */
function CarShape({
  position,
  heading = 0,
  scale = 1.4,
  bodyColor = "#F4F6FA",
  accentColor = MOVVI_GREEN,
  outlineColor = CAR_OUTLINE,
  opacity = 1,
  zBase = 10000,
}: {
  position: LatLng;
  heading?: number;
  scale?: number;
  bodyColor?: string;
  accentColor?: string;
  outlineColor?: string;
  opacity?: number;
  zBase?: number;
}) {
  return (
    <>
      {/* ground shadow */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase - 3}
        opacity={opacity * 0.55}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 9 * (scale / 1.4),
          fillColor: "#000000",
          fillOpacity: 0.35,
          strokeWeight: 0,
        }}
      />
      {/* body with dark outline */}
      <Marker
        position={position}
        zIndex={zBase}
        opacity={opacity}
        icon={{
          path: CAR_BODY_PATH,
          fillColor: bodyColor,
          fillOpacity: 1,
          strokeColor: outlineColor,
          strokeOpacity: 1,
          strokeWeight: 1.2,
          scale,
          rotation: heading,
          anchor: safePoint(0, 0),
        }}
      />
      {/* cabin/roof */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 1}
        opacity={opacity}
        icon={{
          path: CAR_CABIN_PATH,
          fillColor: accentColor,
          fillOpacity: 1,
          strokeColor: outlineColor,
          strokeOpacity: 0.85,
          strokeWeight: 0.6,
          scale,
          rotation: heading,
          anchor: safePoint(0, 0),
        }}
      />
      {/* windshield hint */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 2}
        opacity={opacity * 0.9}
        icon={{
          path: CAR_WINDSHIELD_PATH,
          fillColor: outlineColor,
          fillOpacity: 0.55,
          strokeWeight: 0,
          scale,
          rotation: heading,
          anchor: safePoint(0, 0),
        }}
      />
    </>
  );
}

/* ────────────── Passageiro: ponto GPS com pulso animado + glow ──────────────
 * O pulso é interpolado via RAF (scale 8→22, opacidade 0.30→0). Um segundo
 * anel entra defasado 900ms para sensação contínua de "vivo". Custo: 2 setState
 * a cada frame — desprezível para 1 marcador na tela.
 */
function useRipple(period = 1800, offset = 0) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() - offset;
    const step = (now: number) => {
      const t = ((now - start) % period) / period; // 0..1
      setPhase(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [period, offset]);
  return phase;
}

export function PassengerLocationMarker({
  position,
  color = "#3b82f6",
}: {
  position: LatLng;
  color?: string;
}) {
  const p1 = useRipple(1800, 0);
  const p2 = useRipple(1800, 900);
  const ring = (t: number, z: number) => {
    const scale = 8 + t * 16; // 8 → 24
    const opacity = (1 - t) * 0.28;
    return (
      <Marker
        position={position}
        clickable={false}
        zIndex={z}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale,
          fillColor: color,
          fillOpacity: opacity * 0.5,
          strokeColor: color,
          strokeOpacity: opacity,
          strokeWeight: 1.5,
        }}
      />
    );
  };
  return (
    <>
      {ring(p1, 9995)}
      {ring(p2, 9996)}
      {/* sombra suave */}

      <Marker
        position={position}
        clickable={false}
        zIndex={9998}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 9,
          fillColor: "#000000",
          fillOpacity: 0.16,
          strokeWeight: 0,
        }}
      />
      {/* núcleo — 32px total (scale 8 = ~16px raio) */}
      <Marker
        position={position}
        zIndex={9999}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 8,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        }}
      />
    </>
  );
}

/* ────────────── Pin de embarque / destino ────────────── */
export function PlacePinMarker({
  position,
  color,
  zIndexBase = 9990,
}: {
  position: LatLng;
  color: string;
  zIndexBase?: number;
}) {
  return (
    <>
      {/* halo colorido — reduzido ~40% */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zIndexBase}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 10,
          fillColor: color,
          fillOpacity: 0.1,
          strokeColor: color,
          strokeOpacity: 0.25,
          strokeWeight: 1,
        }}
      />
      {/* sombra do pin */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zIndexBase + 1}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 5,
          fillColor: "#000000",
          fillOpacity: 0.2,
          strokeWeight: 0,
          anchor: safePoint(0, -2),
        }}
      />
      {/* pino em si — 36px de altura visual */}
      <Marker
        position={position}
        zIndex={zIndexBase + 2}
        icon={{
          path: PIN_PATH,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 1.7,
          anchor: safePoint(12, 22),
        }}
      />
    </>
  );
}

/* ────────────── Motorista com interpolação de posição e heading ──────────────
 * Suaviza a chegada de novas coordenadas via GPS ao longo de ~900ms e
 * interpola a rotação pelo caminho mais curto (evita giro de 359°).
 * Quando parado, mantém um halo suave que dá a sensação de "vivo".
 */
export function InterpolatedDriverMarker({
  position,
  heading,
  color = "#2563eb",
  scale = 1.7,
}: {
  position: LatLng;
  heading?: number | null;
  color?: string;
  scale?: number;
}) {
  const [display, setDisplay] = useState<LatLng>(position);
  const [displayHeading, setDisplayHeading] = useState<number>(heading ?? 0);
  const fromRef = useRef({ pos: position, heading: heading ?? 0, t: performance.now() });
  const toRef = useRef({ pos: position, heading: heading ?? 0 });
  const rafRef = useRef<number | null>(null);
  const displayRef = useRef({ pos: position, heading: heading ?? 0 });

  useEffect(() => {
    displayRef.current = { pos: display, heading: displayHeading };
  });

  useEffect(() => {
    // Restart animation from current displayed values towards new target.
    fromRef.current = {
      pos: displayRef.current.pos,
      heading: displayRef.current.heading,
      t: performance.now(),
    };
    // shortest-arc heading
    let target = heading ?? displayRef.current.heading;
    let dh = target - fromRef.current.heading;
    while (dh > 180) dh -= 360;
    while (dh < -180) dh += 360;
    target = fromRef.current.heading + dh;
    toRef.current = { pos: position, heading: target };

    if (rafRef.current != null) return; // loop já em execução
    const DURATION = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - fromRef.current.t) / DURATION);
      const lat =
        fromRef.current.pos.lat + (toRef.current.pos.lat - fromRef.current.pos.lat) * t;
      const lng =
        fromRef.current.pos.lng + (toRef.current.pos.lng - fromRef.current.pos.lng) * t;
      const h =
        fromRef.current.heading + (toRef.current.heading - fromRef.current.heading) * t;
      setDisplay({ lat, lng });
      setDisplayHeading(h);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.lat, position.lng, heading]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return (
    <>
      {/* halo suave — reduzido ~40% */}
      <Marker
        position={display}
        clickable={false}
        zIndex={9997}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 13,
          fillColor: color,
          fillOpacity: 0.08,
          strokeColor: color,
          strokeOpacity: 0.2,
          strokeWeight: 1,
        }}
      />
      {/* sombra */}
      <Marker
        position={display}
        clickable={false}
        zIndex={9998}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 10,
          fillColor: "#000000",
          fillOpacity: 0.18,
          strokeWeight: 0,
        }}
      />
      {/* carro — 32px */}
      <Marker
        position={display}
        zIndex={10000}
        icon={{
          path: CAR_PATH,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.2,
          scale,
          rotation: displayHeading,
          anchor: safePoint(12, 14),
        }}
      />
    </>
  );
}

/* ────────────── Motorista próximo (idle no mapa do passageiro) ──────────────
 * `dimmed` reduz opacidade/tamanho para que motoristas próximos NUNCA sejam
 * confundidos com o motorista da corrida ativa (que usa InterpolatedDriverMarker
 * em azul, maior e com halo). Cor verde-limão + carro menor + sombra suave.
 */
export function NearbyDriverMarker({
  position,
  dimmed = false,
}: {
  position: LatLng;
  dimmed?: boolean;
}) {
  const opacity = dimmed ? 0.55 : 1;
  const scale = dimmed ? 1.05 : 1.35;
  // Fade-in suave ao entrar no mapa (~450ms) — sem RAF por marker.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const fade = mounted ? 1 : 0;
  return (
    <>
      {/* halo verde suave — só nos "vivos", indica presença */}
      {!dimmed && (
        <Marker
          position={position}
          clickable={false}
          zIndex={9994}
          opacity={fade}
          icon={{
            path: safeSymbol("CIRCLE"),
            scale: 14,
            fillColor: "#8DD92B",
            fillOpacity: 0.08,
            strokeColor: "#8DD92B",
            strokeOpacity: 0.22,
            strokeWeight: 1,
          }}
        />
      )}
      <Marker
        position={position}
        clickable={false}
        zIndex={9995}
        opacity={(dimmed ? 0.35 : 1) * fade}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: dimmed ? 8 : 11,
          fillColor: "#000000",
          fillOpacity: 0.18,
          strokeWeight: 0,
        }}
      />
      <Marker
        position={position}
        opacity={opacity * fade}
        icon={{
          path: CAR_PATH,
          fillColor: "#8DD92B",
          fillOpacity: 1,
          strokeColor: "#05070D",
          strokeWeight: 1.4,
          scale,
          anchor: safePoint(12, 14),
        }}
      />
    </>
  );
}

