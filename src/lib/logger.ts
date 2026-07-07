/**
 * Centralized logger.
 *
 * - `debug` / `info` → suppressed in production (published builds).
 * - `warn` / `error` → always emitted so runtime issues stay visible.
 *
 * Import as `import { logger } from "@/lib/logger"` and use in place of
 * `console.log`. Existing `console.*` calls keep working; migrate opportunistically.
 */

const isProd =
  typeof import.meta !== "undefined" &&
  // Vite exposes MODE / PROD at build time
  (import.meta as unknown as { env?: { PROD?: boolean; MODE?: string } }).env?.PROD === true;

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

export const logger = {
  debug: isProd ? noop : (console.debug.bind(console) as LogFn),
  info: isProd ? noop : (console.info.bind(console) as LogFn),
  log: isProd ? noop : (console.log.bind(console) as LogFn),
  warn: console.warn.bind(console) as LogFn,
  error: console.error.bind(console) as LogFn,
};

export default logger;
