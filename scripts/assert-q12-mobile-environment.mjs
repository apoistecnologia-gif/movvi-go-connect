// APOIS/SENATRAN Q12: deny mobile homologation APKs connected to live/legacy systems.
// No changes to existing production builds that do not opt in to homologation.
export function assertQ12MobileEnvironment(env) {
  const tier = String(env.APOIS_MOBILE_BUILD_TIER ?? '').trim().toLowerCase();
  if (!tier || tier === 'production') return;
  if (tier !== 'homologation') {
    throw new Error('APOIS Q12 mobile: invalid build tier; refusing to continue.');
  }
  const url = String(env.VITE_SUPABASE_URL ?? '').trim();
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const api = String(env.APOIS_Q12_RESOLVED_SERVER_FN_BASE ?? '').trim();
  const explicitApi = String(env.VITE_TSS_SERVER_FN_BASE ?? '').trim();
  if (!url || !key || !api || !explicitApi) {
    throw new Error('APOIS Q12 mobile: homologation requires explicit independent Supabase/API settings.');
  }
  const knownReferences = [
    'ptgkwyyolrdgnqketkjj', 'tbbzkrfupmqdywnzgnms',
    'sbvhdgyuuperszlsllji', 'vqtucstyduxrqjgyigfk',
  ];
  for (const [label, value] of [
    ['VITE_SUPABASE_URL', url],
    ['VITE_SUPABASE_PROJECT_ID', String(env.VITE_SUPABASE_PROJECT_ID ?? '')],
    ['VITE_TSS_SERVER_FN_BASE', api],
  ]) {
    if (knownReferences.some((ref) => value.toLowerCase().includes(ref))) {
      throw new Error(`APOIS Q12 mobile: ${label} points to a live/legacy project.`);
    }
  }
  const blockedHosts = ['movvi-go-connect.lovable.app', 'admin-corridas.apoisbrasil.com.br'];
  if (blockedHosts.some((host) => api.toLowerCase().includes(host))) {
    throw new Error('APOIS Q12 mobile: homologation cannot reuse a production/legacy API host.');
  }
  for (const [label, value] of [['Supabase', url], ['API', api]]) {
    if (!/^https:\/\/[^/\s?#]+(?:[/?#]|$)/i.test(value)) {
      throw new Error(`APOIS Q12 mobile: ${label} endpoint must use HTTPS.`);
    }
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY || env.APOIS_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('APOIS Q12 mobile: privileged database credentials forbidden in APK build.');
  }
}
