import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/download/movvi-source")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("downloads")
          .createSignedUrl("movvi-drive-source.zip", 60 * 60, {
            download: "movvi-drive-source.zip",
          });
        if (error || !data?.signedUrl) {
          return new Response("Arquivo indisponível", { status: 500 });
        }
        return new Response(null, {
          status: 302,
          headers: { Location: data.signedUrl },
        });
      },
    },
  },
});
