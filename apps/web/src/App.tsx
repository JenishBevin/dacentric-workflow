import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { Spinner } from "./components/ui/primitives";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const ActivateAccountPage = lazy(() => import("./pages/auth/ActivateAccountPage"));

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const BoardsListPage = lazy(() => import("./pages/boards/BoardsListPage"));
const ServiceProjectsPage = lazy(() => import("./pages/boards/ServiceProjectsPage"));
const BoardKanbanPage = lazy(() => import("./pages/boards/BoardKanbanPage"));
const EnquiryListPage = lazy(() => import("./pages/boards/EnquiryListPage"));
const EstimationPage = lazy(() => import("./pages/boards/EstimationPage"));
const AccountsPage = lazy(() => import("./pages/boards/AccountsPage"));
const ProcurementListPage = lazy(() => import("./pages/procurement/ProcurementListPage"));
const MyTasksPage = lazy(() => import("./pages/MyTasksPage"));
const TeamWorkloadPage = lazy(() => import("./pages/TeamWorkloadPage"));
const TimeLogsPage = lazy(() => import("./pages/TimeLogsPage"));
const RecentActivityPage = lazy(() => import("./pages/RecentActivityPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const CustomersListPage = lazy(() => import("./pages/customers/CustomersListPage"));
const CustomerDetailPage = lazy(() => import("./pages/customers/CustomerDetailPage"));
const ErpHomePage = lazy(() => import("./pages/erp/ErpHomePage"));
const MyProfilePage = lazy(() => import("./pages/settings/MyProfilePage"));
const UsersSettingsPage = lazy(() => import("./pages/settings/UsersSettingsPage"));
const EmployeesSettingsPage = lazy(() => import("./pages/settings/EmployeesSettingsPage"));
const RolesSettingsPage = lazy(() => import("./pages/settings/RolesSettingsPage"));
const TagsSettingsPage = lazy(() => import("./pages/settings/TagsSettingsPage"));
const NotificationSettingsPage = lazy(() => import("./pages/settings/NotificationSettingsPage"));
const AuditTrailPage = lazy(() => import("./pages/settings/AuditTrailPage"));
const BackupSettingsPage = lazy(() => import("./pages/settings/BackupSettingsPage"));
const RequestPage = lazy(() => import("./pages/RequestPage"));
const TicketsPage = lazy(() => import("./pages/TicketsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/activate" element={<ActivateAccountPage />} />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workflow/boards" element={<BoardsListPage />} />
          <Route path="/workflow/boards/service/:serviceId" element={<ServiceProjectsPage />} />
          <Route path="/workflow/boards/:boardId" element={<BoardKanbanPage />} />
          <Route path="/workflow/enquiries" element={<EnquiryListPage />} />
          <Route path="/workflow/estimation" element={<EstimationPage />} />
          <Route path="/workflow/accounts" element={<AccountsPage />} />
          <Route path="/workflow/procurement" element={<ProcurementListPage />} />
          {/* Same BoardKanbanPage as /workflow/boards/:boardId, just under the
              Procurement path so the sidebar highlights "Procurement" (NavLink
              matches by prefix) instead of "Projects" while viewing it. */}
          <Route path="/workflow/procurement/:boardId" element={<BoardKanbanPage />} />
          <Route path="/workflow/my-tasks" element={<MyTasksPage />} />
          <Route path="/workflow/team" element={<TeamWorkloadPage />} />
          <Route path="/workflow/time-logs" element={<TimeLogsPage />} />
          <Route path="/workflow/activity" element={<RecentActivityPage />} />
          <Route path="/workflow/history" element={<HistoryPage />} />
          <Route path="/workflow/customers" element={<CustomersListPage />} />
          <Route path="/workflow/customers/:customerId" element={<CustomerDetailPage />} />
          <Route path="/erp" element={<ErpHomePage />} />
          <Route path="/hrms/leave" element={<RequestPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/settings/profile" element={<MyProfilePage />} />
          <Route path="/settings/users" element={<UsersSettingsPage />} />
          <Route path="/settings/employees" element={<EmployeesSettingsPage />} />
          <Route path="/settings/roles" element={<RolesSettingsPage />} />
          <Route path="/settings/tags" element={<TagsSettingsPage />} />
          <Route path="/settings/notifications" element={<NotificationSettingsPage />} />
          <Route path="/settings/audit" element={<AuditTrailPage />} />
          <Route path="/settings/backup" element={<BackupSettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
