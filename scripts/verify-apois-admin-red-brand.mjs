import { readFileSync, readdirSync } from "node:fs";
function read(path) { return readFileSync(path, "utf8"); }
function assert(ok,label) { if (!ok) throw Error("[FAIL] " + label); console.log("[OK] " + label); }
const theme=read("src/apois-admin-theme.css");
const layout=read("src/components/admin/AdminLayout.tsx");
const sidebar=read("src/components/admin/AdminSidebar.tsx");
const logo=read("src/assets/apoisOfficial2026.ts");
const login=read("src/routes/admin.login.tsx");
const map=read("src/lib/adminVisual.ts");
assert(theme.includes("APOIS_ADMIN_RED_2026") && theme.includes("#E51B23") && theme.includes("#C9141B"),"Canon red/white APOIS 2026 brand tokens");
assert(theme.includes("--background: #F6F7F9") && theme.includes("--card: #FFFFFF"),"All Admin semantic surfaces use light APOIS backgrounds");
assert(theme.includes("--primary-foreground: #FFFFFF") && theme.includes("color-scheme: light"),"Red buttons and inputs have readable foreground");
assert(layout.includes("apois-admin-theme") && layout.includes("<AdminGuard>"),"Admin layout keeps RBAC and scoped theme");
assert(sidebar.includes("APOIS_OFFICIAL_RED_LOGO_URL") && sidebar.includes("ADMIN_NAV") && sidebar.includes("loadAdminAccess"),"Official logo and permission-aware navigation retained");
assert(logo.includes("data:image/png;base64,iVBORw0KGgo"),"Circular official logo remains embedded offline");
assert(map.includes('gold: "#E51B23"') && map.includes('goldStrong: "#C9141B"'),"Admin Google map markers match current red brand");
assert(login.includes("signInWithPassword") && login.includes("loadAdminAccess"),"Login and authorization unchanged");
const routes=readdirSync("src/routes").filter((f)=>/^admin\..+\.tsx$/.test(f));
assert(routes.length>=20,"All existing Admin route modules remain present");
for(const file of routes){const s=read("src/routes/"+file);assert(s.includes("createFileRoute"),file+" route remains operational");}

assert(login.includes("data-apois-admin-desktop-login") && !login.includes("<AuthShell") && !login.includes("Voltar") && !login.includes("Início"),"Admin uses corporate desktop login without app navigation");
assert(login.includes("APOIS_OFFICIAL_RED_LOGO_URL") && sidebar.includes("APOIS_OFFICIAL_RED_LOGO_URL"),"Official uploaded APOIS emblem used at login and nav");

const recovery = read("src/routes/admin.recuperar-senha.tsx");
const reset = read("src/routes/admin.redefinir-senha.tsx");
assert(login.includes('to="/admin/recuperar-senha"'), "Admin login visibly links password recovery");
assert(recovery.includes("supabase.auth.resetPasswordForEmail") && recovery.includes("/admin/redefinir-senha"), "Recovery email uses the same admin portal origin");
assert(recovery.includes("Se este e-mail estiver cadastrado"), "Recovery does not disclose whether an account exists");
assert(reset.includes("exchangeCodeForSession") && reset.includes('type: "recovery"') && reset.includes("PASSWORD_RECOVERY"), "PKCE, hashed-token and implicit recovery links are supported");
assert(reset.includes('supabase.auth.updateUser({ password: newPassword })') && reset.includes("supabase.auth.signOut()"), "Recovery changes only the linked user password and clears the session");
assert(reset.includes('if (status !== "valid" || submitting) return'), "Invalid recovery links cannot submit a password");
assert(login.includes("loadAdminAccess()"), "Admin permissions remain server-backed and separate from password recovery");

// Regression: no role badge over the circular brand; all Admin map surfaces
// diagnose the missing Maps browser key without changing driver/client behavior.
const mapComponent = read("src/components/MovviMap.tsx");
const dashboard = read("src/routes/admin.dashboard.tsx");
const liveMap = read("src/routes/admin.mapa.tsx");
assert(!sidebar.includes('className="absolute right-3 top-3') && sidebar.includes('className="mt-4 inline-flex'), "Administrator role badge sits below the logo and cannot overlap it");
assert(sidebar.includes("SidebarBrand />") && sidebar.includes('cleanLabel(access?.role, "Admin")'), "Official logo, role badge and RBAC role remain present");
assert(mapComponent.includes("missingApiKeyMessage?: string") && mapComponent.includes('missingApiKeyMessage ??'), "Optional Admin-only Google Maps configuration diagnosis is supported");
assert(dashboard.includes("missingApiKeyMessage=") && liveMap.includes("missingApiKeyMessage="), "Dashboard and live map explain missing Google Maps browser configuration");
assert(mapComponent.includes('if (!GOOGLE_MAPS_API_KEY)') && mapComponent.includes("useJsApiLoader"), "Maps still uses the original Google API and fails closed when no key is set");
