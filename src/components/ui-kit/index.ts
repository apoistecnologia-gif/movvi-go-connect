/**
 * APOIS UI Kit — componentes reutilizáveis para a nova linguagem visual.
 *
 * Cada componente é presentational-only (sem chamada de Supabase, sem
 * lógica de fluxo). Os grandes fluxos de corrida devem adotá-los
 * incrementalmente sem alterar máquinas de estado.
 */
export { ServiceCard, ServicesGrid } from "./ServiceCard";
export type { ServiceCardProps } from "./ServiceCard";
export { ProfileShortcutCard, ProfileShortcutGrid } from "./ProfileShortcutCard";
export type { ProfileShortcutCardProps } from "./ProfileShortcutCard";
export { ActivityCard } from "./ActivityCard";
export type { ActivityCardProps } from "./ActivityCard";
export { RideOptionRow } from "./RideOptionRow";
export type { RideOptionRowProps } from "./RideOptionRow";
