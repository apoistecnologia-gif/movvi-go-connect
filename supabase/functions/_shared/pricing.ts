// Compatibility entrypoint for existing Edge Functions.
// All authoritative fare calculations must live in fare-engine.ts.
export { calculateServerFare } from "./fare-engine.ts";
export type { FareBreakdown, ServiceDetails } from "./fare-engine.ts";
