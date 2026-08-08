import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(path, "utf8");
const includes = (source, needle, label) => assert.ok(source.includes(needle), `${label}: missing ${needle}`);
const excludes = (source, needle, label) => assert.ok(!source.includes(needle), `${label}: forbidden ${needle}`);

const baselineAdmin = read("supabase/baseline/011_admin_control_plane.sql");
const baselineStaff = read("supabase/baseline/012_admin_staff_provisioning.sql");
const baselineFinance = read("supabase/baseline/013_admin_finance.sql");
const baselineSettings = read("supabase/baseline/014_admin_settings.sql");
const seed = read("supabase/baseline/004_storage_triggers_seed.sql");
const access = read("src/lib/adminAccess.ts");
const controlPlane = read("src/lib/adminControlPlane.ts");
const finance = read("src/lib/adminFinance.ts");
const layout = read("src/components/admin/AdminLayout.tsx");
const sidebar = read("src/components/admin/AdminSidebar.tsx");
const login = read("src/routes/admin.login.tsx");
const dashboard = read("src/routes/admin.dashboard.tsx");
const financeRoute = read("src/routes/admin.financeiro.tsx");
const paymentsRoute = read("src/routes/admin.pagamentos.tsx");
const settingsRoute = read("src/routes/admin.configuracoes.tsx");
const backupsRoute = read("src/routes/admin.backups.tsx");
const theme = read("src/apois-admin-theme.css");

// RBAC must be server-authoritative and distinct from mobility user_roles.
includes(seed, "('administrator','admin.access')", "Admin access seed");
includes(seed, "('administrator','audit.read')", "Admin audit permission");
includes(baselineAdmin, "private.has_permission('admin.access')", "Admin authorization");
includes(baselineAdmin, "admin_has_permission", "Granular permission check");
includes(baselineAdmin, "admin_get_access_context", "Admin access context");
includes(access, 'rpc("admin_is_authorized")', "Frontend authorization handshake");
includes(access, '.from("profiles")', "Canonical staff profile");
includes(access, '.from("role_permissions")', "Role permission resolution");
excludes(access, 'from("user_roles")', "Admin/mobility identity separation");

// Critical mutations are audited inside server-side RPCs.
for (const rpc of [
  "admin_set_driver_approval",
  "admin_set_driver_suspension",
  "admin_set_passenger_status",
  "admin_set_staff_profile",
  "admin_update_ride_category",
  "admin_upsert_tariff_rule",
  "admin_update_sos_alert",
  "admin_update_support_ticket",
]) includes(baselineAdmin, rpc, `Admin control plane ${rpc}`);
includes(baselineAdmin, "private.admin_audit", "Atomic admin audit primitive");
includes(baselineStaff, "admin_provision_staff", "Explicit staff provisioning");

// Dashboard/finance must use canonical metrics and settlements, never label a ride-price sum as platform revenue.
includes(controlPlane, 'rpc<AdminDashboardMetrics>("admin_get_dashboard_metrics")', "Canonical dashboard metrics");
includes(dashboard, "getAdminDashboardMetrics", "Dashboard metrics client");
includes(baselineFinance, "admin_get_finance_summary", "Canonical finance summary");
includes(baselineFinance, "ride_settlements", "Settlement-backed finance");
includes(baselineFinance, "driver_withdrawals", "Payout-backed finance");
includes(finance, 'rpc("admin_get_finance_summary"', "Finance RPC client");
includes(financeRoute, "ride_settlements + ledgers + driver_withdrawals", "Finance source-of-truth disclosure");
excludes(financeRoute, '.from("rides")', "Admin finance ride arithmetic");

// Payment-provider UI reports backend truth and never edits gateway credentials in the browser.
includes(paymentsRoute, "getAdminFinanceSummary", "Payment provider source-of-truth");
includes(paymentsRoute, "electronic_payment_provider", "Electronic provider state");
includes(paymentsRoute, "payout_provider", "Payout provider state");
excludes(paymentsRoute, 'from("payment_gateways")', "Legacy gateway table as payment truth");
excludes(paymentsRoute, "api_key_secret_name", "Browser-editable API secret reference");
excludes(paymentsRoute, "pix_key", "Browser-editable PIX key");

// Settings are allowlisted and audited server-side. Secrets are not browser-editable.
includes(baselineSettings, "admin_update_setting", "Audited settings RPC");
includes(baselineSettings, "settings.manage", "Settings permission");
includes(baselineSettings, "setting_not_admin_editable", "Settings allowlist");
includes(baselineSettings, "private.admin_audit", "Settings audit");
includes(settingsRoute, 'rpc("admin_update_setting"', "Settings RPC client");
excludes(settingsRoute, '.upsert(', "Direct browser settings upsert");
excludes(settingsRoute, "google.maps_browser_key_name", "Browser-editable Google secret reference");
excludes(settingsRoute, "firebase.project_id", "Browser-editable Firebase configuration");

// A CSV download is not represented as a database backup or restore operation.
includes(backupsRoute, "Backup de banco não é CSV do navegador", "Backup truthfulness");
excludes(backupsRoute, '.from("backups")', "Fake backup ledger");
excludes(backupsRoute, "downloadCsv", "Fake browser database backup");

// Navigation is permission-filtered, not merely hidden by hardcoded role names.
includes(sidebar, "permission: \"drivers.read\"", "Driver nav permission");
includes(sidebar, "permissionSet.has(item.permission)", "Permission filtered navigation");
includes(sidebar, "APOIS", "APOIS Admin brand");

// Phase 8 rebrand is scoped, so Passenger/Driver themes are not changed accidentally.
includes(layout, 'import "@/apois-admin-theme.css"', "Admin theme import");
includes(layout, "apois-admin-theme", "Admin theme scope");
includes(login, "apois-admin-theme", "Admin login theme scope");
includes(theme, "--primary:", "Admin gold semantic primary");
excludes(theme, "#8DD92B", "Legacy MOVVI green in Admin theme");

console.log("APOIS_ADMIN_PHASE8_CONTRACT_OK");
