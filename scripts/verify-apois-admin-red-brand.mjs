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
