// Chave do Google Maps fornecida pelo conector Lovable (referrer-restricted: *.lovable.app).
// Em desenvolvimento, é injetada como import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY.
export const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined) ?? "";

// Bibliotecas que usamos no app inteiro. IMPORTANTE: manter referência estável para evitar reload do script.
export const GOOGLE_MAPS_LIBRARIES: ("places" | "geometry" | "drawing")[] = ["places", "geometry"];

// Centro padrão (Brasília) usado enquanto o GPS real do usuário não está disponível.
export const BRASILIA_CENTER = { lat: -15.793889, lng: -47.882778 };

// Estilo escuro do mapa, alinhado com a identidade MOVVI.
export const MOVVI_DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#121826" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#05070D" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa3b2" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1c2436" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0d111c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#283149" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a5a73" }] },
];
