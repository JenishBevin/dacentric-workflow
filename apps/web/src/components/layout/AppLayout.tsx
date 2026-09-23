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
        {/* Below sm, two fixed elements float over content: MobileBottomNav
            (~3.5rem) and the ChatWidget FAB, which repositions itself to
            bottom-20 + h-14 (~8.5rem total) specifically to clear the nav —
            so the nav alone isn't enough padding, the FAB sitting above it
            is the taller of the two. 9rem clears both with a little room to
            spare, plus the iOS home-indicator safe-area inset neither fixed
            element's own offset accounts for. At sm and up the FAB drops to
            bottom-4 (no bottom nav to clear) and pb-20 covers it — e.g. so
            Audit Trail's pagination never ends up hidden underneath it. */}
        <main className="flex-1 overflow-y-auto pb-[calc(9rem+env(safe-area-inset-bottom))] sm:pb-20">
          {/* flex h-full flex-col: lets a page (e.g. a Kanban board) opt into
              filling exactly the remaining viewport height and scrolling
              internally, so its own horizontal scrollbar stays on screen
              instead of sinking to the bottom of unbounded tall content.
              A page that doesn't opt in (no h-full/flex-1 of its own) is
              unaffected — it still just sizes to its content and this <main>
              scrolls as before. */}
          <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
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
