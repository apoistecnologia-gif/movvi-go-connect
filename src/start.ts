import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Origens permitidas pelo WebView Capacitor. Precisamos liberar CORS com
// credenciais para essas origens porque o APK, ao chamar server functions
// (via mobileFetchProxy), envia o pedido a partir de capacitor://localhost
// ou https://localhost em vez da mesma origem do backend.
const CAPACITOR_ORIGINS = new Set<string>([
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
  "ionic://localhost",
]);

const corsMiddleware = createMiddleware().server(async ({ next, request }) => {
  const origin = request.headers.get("origin");
  const allowed = origin !== null && CAPACITOR_ORIGINS.has(origin);

  // Preflight: responder imediatamente sem executar o handler abaixo.
  if (request.method === "OPTIONS" && allowed) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin!,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          request.headers.get("access-control-request-headers") ??
          "authorization,content-type,x-requested-with,accept",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  const response = await next();

  if (allowed && response instanceof Response) {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", origin!);
    headers.set("Access-Control-Allow-Credentials", "true");
    const existingVary = headers.get("Vary");
    headers.set("Vary", existingVary ? `${existingVary}, Origin` : "Origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  // CORS antes do errorMiddleware para preflight não passar pelo try/catch.
  requestMiddleware: [corsMiddleware, errorMiddleware],
}));
