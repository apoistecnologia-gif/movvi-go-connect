/**
 * MOVVI DRIVE — Câmera de mapa premium.
 *
 * Interpolação suave de centro + zoom para dar a sensação de câmera
 * cinematográfica (Uber/99/InDrive) sem depender do animation nativo
 * do Google Maps (que só anima o `panTo` e faz `setZoom` de forma
 * instantânea, causando "salto"). Não altera fitBounds — apenas
 * pan/zoom livres. É seguro chamar mesmo com valores idênticos.
 */

type LatLng = { lat: number; lng: number };

type CameraTarget = { center: LatLng; zoom: number };

const activeAnimations = new WeakMap<google.maps.Map, number>();

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function cancel(map: google.maps.Map) {
  const raf = activeAnimations.get(map);
  if (raf != null) {
    cancelAnimationFrame(raf);
    activeAnimations.delete(map);
  }
}

export function smoothPanZoom(
  map: google.maps.Map | null | undefined,
  target: LatLng,
  targetZoom?: number,
  duration = 650,
) {
  if (!map) return;
  cancel(map);
  const startCenter = map.getCenter();
  const startZoom = map.getZoom() ?? targetZoom ?? 14;
  const to: CameraTarget = { center: target, zoom: targetZoom ?? startZoom };
  if (!startCenter) {
    map.setCenter(to.center);
    if (targetZoom != null) map.setZoom(to.zoom);
    return;
  }
  const from: CameraTarget = {
    center: { lat: startCenter.lat(), lng: startCenter.lng() },
    zoom: startZoom,
  };
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    const e = easeInOutCubic(t);
    const lat = from.center.lat + (to.center.lat - from.center.lat) * e;
    const lng = from.center.lng + (to.center.lng - from.center.lng) * e;
    map.setCenter({ lat, lng });
    if (targetZoom != null && Math.abs(to.zoom - from.zoom) > 0.01) {
      map.setZoom(from.zoom + (to.zoom - from.zoom) * e);
    }
    if (t < 1) {
      activeAnimations.set(map, requestAnimationFrame(step));
    } else {
      activeAnimations.delete(map);
    }
  };
  activeAnimations.set(map, requestAnimationFrame(step));
}

export function smoothPan(map: google.maps.Map | null | undefined, target: LatLng, duration = 500) {
  smoothPanZoom(map, target, undefined, duration);
}
