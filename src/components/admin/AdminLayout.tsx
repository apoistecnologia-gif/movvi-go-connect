import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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

export function AdminLayout({ title, description, actions, children }: AdminLayoutProps) {
  const [open, setOpen] = useState(false);
  return (
    <AdminGuard>
      <div className="apois-admin-theme flex min-h-dvh bg-background text-foreground">
        <div className="hidden lg:block">
          <AdminSidebar />
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="left"
            className="apois-admin-theme w-[min(82vw,260px)] max-w-[260px] border-r border-border p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            <AdminSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="admin-page-header sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
            <DSButton
              variant="ghost"
              size="icon"
              className="admin-menu-trigger lg:hidden"
              aria-label="Abrir menu"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </DSButton>
            <div className="admin-page-heading min-w-0">
              <h1 className="font-display text-lg font-bold leading-tight truncate">{title}</h1>
              {description && (
                <p className="text-xs text-muted-foreground truncate">{description}</p>
              )}
            </div>
            {actions && <div className="admin-page-actions ml-auto flex items-center gap-2">{actions}</div>}
          </header>
          <main className="admin-page-main flex-1 overflow-x-hidden p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
