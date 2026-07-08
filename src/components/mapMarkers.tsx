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

const PIN_PATH =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z";


/* Top-down car silhouette. Centered on (0,0), front pointing "up" (−Y).
 * Bounding box ≈ 14×22. Designed original for MOVVI — realistic sedan with
 * rounded body, dark cabin/windshield, headlights and taillights. */
const CAR_BODY_PATH =
  "M -6 -10 C -7 -10 -7 -8.5 -7 -7.5 L -7 8 C -7 9.5 -6 10.5 -4.5 10.5 L 4.5 10.5 C 6 10.5 7 9.5 7 8 L 7 -7.5 C 7 -8.5 7 -10 6 -10 C 5 -11 3 -11.5 0 -11.5 C -3 -11.5 -5 -11 -6 -10 Z";
/* Highlight strip (lighter red gloss). */
const CAR_HIGHLIGHT_PATH =
  "M -5 -8 C -5 -9 -3 -10 0 -10 C 3 -10 5 -9 5 -8 L 5 8 C 5 9 4 9.5 3 9.5 L -3 9.5 C -4 9.5 -5 9 -5 8 Z";
/* Front windshield (dark trapezoid, wider at bottom). */
const CAR_WINDSHIELD_PATH =
  "M -4.5 -4 L 4.5 -4 L 4 2 L -4 2 Z";
/* Roof (dark rectangle covering cabin). */
const CAR_ROOF_PATH =
  "M -4 2 L 4 2 L 4 6.5 L -4 6.5 Z";
/* Rear windshield. */
const CAR_REAR_GLASS_PATH =
  "M -4 6.5 L 4 6.5 L 4.5 9 L -4.5 9 Z";
/* Headlight (small oval) — one at left, mirror right via separate marker. */
const HEADLIGHT_PATH =
  "M -0.9 -0.6 A 0.9 0.6 0 1 0 0.9 -0.6 A 0.9 0.6 0 1 0 -0.9 -0.6 Z";

const MOVVI_RED = "#E63946";
const MOVVI_RED_DARK = "#8a0a12";
const CAR_OUTLINE = "#2a0408";
const GLASS_DARK = "#0f1420";
const HEADLIGHT_COLOR = "#fff4c2";
const TAILLIGHT_COLOR = "#ffb347";

/* Layered top-down car. Renders stacked Markers so rotation stays coherent.
 * All layers share position + rotation. */
function CarShape({
  position,
  heading = 0,
  scale = 1.6,
  bodyColor = MOVVI_RED,
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
  const rot = heading;
  const anchor0 = safePoint(0, 0);
  // Offset anchors for lights — Google rotates around anchor, so we translate
  // via anchor offsets to keep lights at correct positions relative to body.
  const headlightLeftAnchor = safePoint(-3.5, 9.5);
  const headlightRightAnchor = safePoint(3.5, 9.5);
  const taillightLeftAnchor = safePoint(-2.5, -8);
  const taillightRightAnchor = safePoint(2.5, -8);
  return (
    <>
      {/* ground shadow — larger, softer */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase - 3}
        opacity={opacity * 0.5}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 11 * (scale / 1.6),
          fillColor: "#000000",
          fillOpacity: 0.4,
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
          rotation: rot,
          anchor: anchor0,
        }}
      />
      {/* subtle red highlight for gloss */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 1}
        opacity={opacity * 0.55}
        icon={{
          path: CAR_HIGHLIGHT_PATH,
          fillColor: "#ff8a92",
          fillOpacity: 0.5,
          strokeWeight: 0,
          scale,
          rotation: rot,
          anchor: anchor0,
        }}
      />
      {/* front windshield */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 2}
        opacity={opacity}
        icon={{
          path: CAR_WINDSHIELD_PATH,
          fillColor: GLASS_DARK,
          fillOpacity: 0.95,
          strokeColor: CAR_OUTLINE,
          strokeOpacity: 0.9,
          strokeWeight: 0.6,
          scale,
          rotation: rot,
          anchor: anchor0,
        }}
      />
      {/* roof (darker red) */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 3}
        opacity={opacity}
        icon={{
          path: CAR_ROOF_PATH,
          fillColor: MOVVI_RED_DARK,
          fillOpacity: 1,
          strokeColor: CAR_OUTLINE,
          strokeOpacity: 0.8,
          strokeWeight: 0.5,
          scale,
          rotation: rot,
          anchor: anchor0,
        }}
      />
      {/* rear windshield */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 4}
        opacity={opacity}
        icon={{
          path: CAR_REAR_GLASS_PATH,
          fillColor: GLASS_DARK,
          fillOpacity: 0.9,
          strokeColor: CAR_OUTLINE,
          strokeOpacity: 0.85,
          strokeWeight: 0.5,
          scale,
          rotation: rot,
          anchor: anchor0,
        }}
      />
      {/* headlights (left + right) */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 5}
        opacity={opacity}
        icon={{
          path: HEADLIGHT_PATH,
          fillColor: HEADLIGHT_COLOR,
          fillOpacity: 1,
          strokeColor: CAR_OUTLINE,
          strokeOpacity: 0.7,
          strokeWeight: 0.3,
          scale,
          rotation: rot,
          anchor: headlightLeftAnchor,
        }}
      />
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 5}
        opacity={opacity}
        icon={{
          path: HEADLIGHT_PATH,
          fillColor: HEADLIGHT_COLOR,
          fillOpacity: 1,
          strokeColor: CAR_OUTLINE,
          strokeOpacity: 0.7,
          strokeWeight: 0.3,
          scale,
          rotation: rot,
          anchor: headlightRightAnchor,
        }}
      />
      {/* taillights (left + right) */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 5}
        opacity={opacity}
        icon={{
          path: HEADLIGHT_PATH,
          fillColor: TAILLIGHT_COLOR,
          fillOpacity: 0.9,
          strokeColor: CAR_OUTLINE,
          strokeOpacity: 0.6,
          strokeWeight: 0.3,
          scale: scale * 0.8,
          rotation: rot,
          anchor: taillightLeftAnchor,
        }}
      />
      <Marker
        position={position}
        clickable={false}
        zIndex={zBase + 5}
        opacity={opacity}
        icon={{
          path: HEADLIGHT_PATH,
          fillColor: TAILLIGHT_COLOR,
          fillOpacity: 0.9,
          strokeColor: CAR_OUTLINE,
          strokeOpacity: 0.6,
          strokeWeight: 0.3,
          scale: scale * 0.8,
          rotation: rot,
          anchor: taillightRightAnchor,
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
      {/* halo colorido para destacar o motorista da corrida ativa */}
      <Marker
        position={display}
        clickable={false}
        zIndex={9997}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 15,
          fillColor: color,
          fillOpacity: 0.1,
          strokeColor: color,
          strokeOpacity: 0.28,
          strokeWeight: 1.2,
        }}
      />
      {/* carro top-down com identidade MOVVI (corpo claro + cabine verde) */}
      <CarShape
        position={display}
        heading={displayHeading}
        scale={scale}
        bodyColor="#F4F6FA"
        accentColor={color}
        zBase={10000}
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
      {/* carro top-down em verde MOVVI para motoristas próximos */}
      <CarShape
        position={position}
        heading={0}
        scale={scale}
        bodyColor="#8DD92B"
        accentColor="#F4F6FA"
        outlineColor="#05070D"
        opacity={opacity * fade}
        zBase={9996}
      />
    </>
  );
}

