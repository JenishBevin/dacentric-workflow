import React, { Suspense, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileBottomNav } from "./MobileBottomNav";
import { ChatWidget } from "../chat/ChatWidget";
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
        <main className="flex-1 overflow-y-auto pb-16 sm:pb-0">
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
    </div>
  );
};
