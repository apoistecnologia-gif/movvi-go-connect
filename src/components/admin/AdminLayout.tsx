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
      <div className="apois-admin-theme flex min-h-screen bg-background text-foreground">
        <div className="hidden lg:block">
          <AdminSidebar />
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="apois-admin-theme w-64 p-0 border-r border-border">
            <AdminSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
            <DSButton
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menu"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </DSButton>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-bold leading-tight truncate">{title}</h1>
              {description && (
                <p className="text-xs text-muted-foreground truncate">{description}</p>
              )}
            </div>
            {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
          </header>
          <main className="flex-1 overflow-x-hidden p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
