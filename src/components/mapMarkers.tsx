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

const CAR_PATH =
  "M5 11l1.5-4.5h11L19 11M6 14h12M7.5 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm12 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM5 11h14v4H5z";
const PIN_PATH =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z";

/* ────────────── Passageiro: ponto GPS com pulso + glow ────────────── */
export function PassengerLocationMarker({
  position,
  color = "#3b82f6",
}: {
  position: LatLng;
  color?: string;
}) {
  return (
    <>
      {/* glow externo — pulsa via zIndex baixo, respiração implícita da UI */}
      <Marker
        position={position}
        clickable={false}
        zIndex={9996}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 28,
          fillColor: color,
          fillOpacity: 0.1,
          strokeColor: color,
          strokeOpacity: 0.25,
          strokeWeight: 1,
        }}
      />
      <Marker
        position={position}
        clickable={false}
        zIndex={9997}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 18,
          fillColor: color,
          fillOpacity: 0.22,
          strokeColor: color,
          strokeOpacity: 0.5,
          strokeWeight: 1,
        }}
      />
      {/* sombra suave */}
      <Marker
        position={position}
        clickable={false}
        zIndex={9998}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 11,
          fillColor: "#000000",
          fillOpacity: 0.2,
          strokeWeight: 0,
        }}
      />
      {/* núcleo */}
      <Marker
        position={position}
        zIndex={9999}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 9,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3.5,
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
      {/* halo colorido */}
      <Marker
        position={position}
        clickable={false}
        zIndex={zIndexBase}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 16,
          fillColor: color,
          fillOpacity: 0.16,
          strokeColor: color,
          strokeOpacity: 0.4,
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
          scale: 6,
          fillColor: "#000000",
          fillOpacity: 0.25,
          strokeWeight: 0,
          anchor: safePoint(0, -2),
        }}
      />
      {/* pino em si — maior + borda branca grossa */}
      <Marker
        position={position}
        zIndex={zIndexBase + 2}
        icon={{
          path: PIN_PATH,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
          scale: 2.2,
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
  scale = 2.1,
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
      {/* halo suave — sensação "vivo" quando parado */}
      <Marker
        position={display}
        clickable={false}
        zIndex={9997}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 22,
          fillColor: color,
          fillOpacity: 0.12,
          strokeColor: color,
          strokeOpacity: 0.3,
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
          scale: 13,
          fillColor: "#000000",
          fillOpacity: 0.22,
          strokeWeight: 0,
        }}
      />
      {/* carro */}
      <Marker
        position={display}
        zIndex={10000}
        icon={{
          path: CAR_PATH,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.4,
          scale,
          rotation: displayHeading,
          anchor: safePoint(12, 14),
        }}
      />
    </>
  );
}

/* ────────────── Motorista próximo (idle no mapa do passageiro) ────────────── */
export function NearbyDriverMarker({ position }: { position: LatLng }) {
  return (
    <>
      <Marker
        position={position}
        clickable={false}
        zIndex={9995}
        icon={{
          path: safeSymbol("CIRCLE"),
          scale: 11,
          fillColor: "#000000",
          fillOpacity: 0.18,
          strokeWeight: 0,
        }}
      />
      <Marker
        position={position}
        icon={{
          path: CAR_PATH,
          fillColor: "#8DD92B",
          fillOpacity: 1,
          strokeColor: "#05070D",
          strokeWeight: 1.4,
          scale: 1.35,
          anchor: safePoint(12, 14),
        }}
      />
    </>
  );
}
