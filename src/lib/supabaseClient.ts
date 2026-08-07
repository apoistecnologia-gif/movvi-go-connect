// APOIS — cliente Supabase centralizado.
// Re-exporta o cliente gerenciado pelo Lovable Cloud (publishable key + sessão persistente).
// Usar `import { supabase } from "@/lib/supabaseClient"` em qualquer lugar do app.
export { supabase } from "@/integrations/supabase/client";
export type { Database } from "@/integrations/supabase/types";
