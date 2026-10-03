import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { Spinner } from "./components/ui/primitives";
import { isLocalhost } from "./lib/isLocalhost";

const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const ActivateAccountPage = lazy(() => import("./pages/auth/ActivateAccountPage"));

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const CrmDashboardPage = lazy(() => import("./pages/dashboard/CrmDashboardPage"));
const HrmsDashboardPage = lazy(() => import("./pages/dashboard/HrmsDashboardPage"));
const BoardsListPage = lazy(() => import("./pages/boards/BoardsListPage"));
// Old per-service page: the Projects page now filters by service itself, so bookmarks/links land there.
function ServiceProjectsRedirect() {
  const { serviceId } = useParams<{ serviceId: string }>();
  return <Navigate to={`/workflow/boards?service=${serviceId ?? ""}`} replace />;
}
const BoardKanbanPage = lazy(() => import("./pages/boards/BoardKanbanPage"));
const EnquiryListPage = lazy(() => import("./pages/boards/EnquiryListPage"));
const EstimationPage = lazy(() => import("./pages/boards/EstimationPage"));
const AccountsPage = lazy(() => import("./pages/boards/AccountsPage"));
const ProcurementListPage = lazy(() => import("./pages/procurement/ProcurementListPage"));
const MyTasksPage = lazy(() => import("./pages/MyTasksPage"));
const TeamWorkloadPage = lazy(() => import("./pages/TeamWorkloadPage"));
const FollowUpWorkloadPage = lazy(() => import("./pages/FollowUpWorkloadPage"));
const QuotationEditorPage = lazy(() => import("./pages/tasks/QuotationEditorPage"));
const QuotationViewerPage = lazy(() => import("./pages/tasks/QuotationViewerPage"));
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
// HRMS expansion (request 1008) — localhost-only until deployed.
const EmployeeDetailPage = lazy(() => import("./pages/hrms/EmployeeDetailPage"));
const CandidatesPage = lazy(() => import("./pages/hrms/recruitment/CandidatesPage"));
const CvBankPage = lazy(() => import("./pages/hrms/recruitment/CvBankPage"));
const InterviewsPage = lazy(() => import("./pages/hrms/recruitment/InterviewsPage"));
const SelectionPage = lazy(() => import("./pages/hrms/recruitment/SelectionPage"));
const OfferLettersPage = lazy(() => import("./pages/hrms/recruitment/OfferLettersPage"));
const JoiningPage = lazy(() => import("./pages/hrms/recruitment/JoiningPage"));
const SalaryStructurePage = lazy(() => import("./pages/hrms/payroll/SalaryStructurePage"));
const PayrollProcessingPage = lazy(() => import("./pages/hrms/payroll/PayrollProcessingPage"));
const PayslipsPage = lazy(() => import("./pages/hrms/payroll/PayslipsPage"));
const SalaryReportsPage = lazy(() => import("./pages/hrms/payroll/SalaryReportsPage"));
const EmployeeReportPage = lazy(() => import("./pages/hrms/reports/EmployeeReportPage"));
const AttendanceReportPage = lazy(() => import("./pages/hrms/reports/AttendanceReportPage"));
const LeaveReportPage = lazy(() => import("./pages/hrms/reports/LeaveReportPage"));
const PayrollReportPage = lazy(() => import("./pages/hrms/reports/PayrollReportPage"));
const RecruitmentReportPage = lazy(() => import("./pages/hrms/reports/RecruitmentReportPage"));
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
  // Sends logged-out visitors hitting an internal URL directly (e.g. someone
  // probing /dashboard) to the public home page, not the login page — the
  // login URL is intentionally hard to guess, so this path must never reveal it.
  if (!user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login-portal-uae2026" element={<LoginPage />} />
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
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* Per-module dashboards — localhost-only preview, reached by clicking
              a module name in the sidebar (see Sidebar.tsx's ModuleGroup). */}
          {isLocalhost && <Route path="/crm" element={<CrmDashboardPage />} />}
          {isLocalhost && <Route path="/hrms" element={<HrmsDashboardPage />} />}
          <Route path="/workflow/boards" element={<BoardsListPage />} />
          <Route path="/workflow/boards/service/:serviceId" element={<ServiceProjectsRedirect />} />
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
          <Route path="/workflow/follow-ups" element={<FollowUpWorkloadPage />} />
          <Route path="/workflow/tasks/:taskId/quotation" element={<QuotationEditorPage />} />
          <Route path="/workflow/tasks/:taskId/quotations" element={<QuotationViewerPage />} />
          <Route path="/workflow/time-logs" element={<TimeLogsPage />} />
          <Route path="/workflow/activity" element={<RecentActivityPage />} />
          <Route path="/workflow/history" element={<HistoryPage />} />
          <Route path="/workflow/customers" element={<CustomersListPage />} />
          <Route path="/workflow/customers/:customerId" element={<CustomerDetailPage />} />
          <Route path="/erp" element={<ErpHomePage />} />
          <Route path="/hrms/leave" element={<RequestPage />} />
          <Route path="/hrms/employees/:employeeId" element={<EmployeeDetailPage />} />
          <Route path="/hrms/recruitment" element={<Navigate to="/hrms/recruitment/candidates" replace />} />
          <Route path="/hrms/recruitment/candidates" element={<CandidatesPage />} />
          <Route path="/hrms/recruitment/cv-bank" element={<CvBankPage />} />
          <Route path="/hrms/recruitment/interviews" element={<InterviewsPage />} />
          <Route path="/hrms/recruitment/selection" element={<SelectionPage />} />
          <Route path="/hrms/recruitment/offers" element={<OfferLettersPage />} />
          <Route path="/hrms/recruitment/joining" element={<JoiningPage />} />
          <Route path="/hrms/payroll" element={<Navigate to="/hrms/payroll/structure" replace />} />
          <Route path="/hrms/payroll/structure" element={<SalaryStructurePage />} />
          <Route path="/hrms/payroll/processing" element={<PayrollProcessingPage />} />
          <Route path="/hrms/payroll/payslips" element={<PayslipsPage />} />
          <Route path="/hrms/payroll/reports" element={<SalaryReportsPage />} />
          <Route path="/hrms/reports" element={<Navigate to="/hrms/reports/employees" replace />} />
          <Route path="/hrms/reports/employees" element={<EmployeeReportPage />} />
          <Route path="/hrms/reports/attendance" element={<AttendanceReportPage />} />
          <Route path="/hrms/reports/leave" element={<LeaveReportPage />} />
          <Route path="/hrms/reports/payroll" element={<PayrollReportPage />} />
          <Route path="/hrms/reports/recruitment" element={<RecruitmentReportPage />} />
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
