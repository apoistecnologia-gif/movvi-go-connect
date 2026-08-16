import { useId, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DSButton } from "@/design-system";
import { AdminGuard } from "@/components/AdminGuard";
import { AdminSidebar } from "./AdminSidebar";
import "@/apois-admin-theme.css";

interface AdminLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

function cleanLabel(value: unknown, fallback: string) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

export function AdminLayout({ title, description, actions, children }: AdminLayoutProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const safeTitle = cleanLabel(title, "Admin APOIS");
  const safeDescription = cleanLabel(description, "");

  return (
    <AdminGuard>
      <div className="apois-admin-theme flex min-h-dvh min-w-0 overflow-x-hidden bg-background text-foreground">
        <aside className="hidden shrink-0 lg:block" aria-label="Navegação administrativa">
          <AdminSidebar />
        </aside>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="left"
            className="apois-admin-theme w-[min(86vw,280px)] max-w-[280px] overflow-x-hidden border-r border-border p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Menu administrativo</SheetTitle>
            </SheetHeader>
            <AdminSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="admin-page-header sticky top-0 z-30 flex min-w-0 flex-wrap items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/75">
            <DSButton
              variant="ghost"
              size="icon"
              className="admin-menu-trigger min-h-11 min-w-11 shrink-0 focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
              aria-label="Abrir menu administrativo"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </DSButton>

            <div className="admin-page-heading min-w-0 flex-1 basis-[180px]">
              <h1 id={titleId} className="break-words font-display text-lg font-bold leading-tight">
                {safeTitle}
              </h1>
              {safeDescription ? (
                <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
                  {safeDescription}
                </p>
              ) : null}
            </div>

            {actions ? (
              <div className="admin-page-actions ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
                {actions}
              </div>
            ) : null}
          </header>

          <main
            className="admin-page-main min-w-0 flex-1 overflow-x-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-6 lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            aria-labelledby={titleId}
          >
            {children}
          </main>
        </div>
      </div>
    </AdminGuard>
  );
}
