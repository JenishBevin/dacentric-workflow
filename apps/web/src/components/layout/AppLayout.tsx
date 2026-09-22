import React, { Suspense, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { ChatWidget } from "../chat/ChatWidget";
import { DesktopNotifications } from "./DesktopNotifications";
import { Spinner } from "../ui/primitives";
import { useAuth } from "../../context/AuthContext";

function ContentFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

const STAFF_HOME = "/hrms/leave";
const STAFF_ALLOWED_PATHS = [STAFF_HOME, "/settings/profile"];

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  // Staff has no Workflow access at all — the only pages they're allowed to
  // reach are Leave and My Profile (not Notifications), enforced here (not
  // just by hiding sidebar/header links) so no typed or bookmarked URL can
  // get them past it. Single choke point: every authenticated route renders
  // through this layout's <Outlet />.
  if (user?.roles.includes("STAFF") && !STAFF_ALLOWED_PATHS.includes(location.pathname)) {
    return <Navigate to={STAFF_HOME} replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        {/* pb-16 clears MobileBottomNav below sm; sm:pb-20 clears the
            floating ChatWidget FAB (h-14 @ bottom-4 ≈ 72px tall) so a
            page's last row — e.g. Audit Trail's pagination — never ends up
            hidden underneath it. */}
        <main className="flex-1 overflow-y-auto pb-16 sm:pb-20">
          {/* flex h-full flex-col: lets a page (e.g. a Kanban board) opt into
              filling exactly the remaining viewport height and scrolling
              internally, so its own horizontal scrollbar stays on screen
              instead of sinking to the bottom of unbounded tall content.
              A page that doesn't opt in (no h-full/flex-1 of its own) is
              unaffected — it still just sizes to its content and this <main>
              scrolls as before. */}
          <div className="mx-auto flex h-full max-w-[1600px] flex-col px-4 py-5 sm:px-6">
            {/* Local Suspense boundary: only the page content re-suspends on
                route change, so the sidebar/header never unmount-and-flash. */}
            <Suspense fallback={<ContentFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        <MobileBottomNav />
      </div>
      <ChatWidget />
      <DesktopNotifications />
    </div>
  );
};
