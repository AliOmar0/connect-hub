import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/theme-provider";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleBasedRedirect from "@/components/RoleBasedRedirect";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import SessionsPage from "./pages/SessionsPage";
import EmployeesPage from "./pages/EmployeesPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import ShortcutsPage from "./pages/ShortcutsPage";
import QueuePage from "./pages/QueuePage";
import ComplaintsPage from "./pages/ComplaintsPage";
import KnowledgePage from "./pages/KnowledgePage";
import SupportPage from "./pages/SupportPage";
import NotFound from "./pages/NotFound";

import EscalationListener from "@/components/EscalationListener";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <EscalationListener />
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ErrorBoundary>
            <BrowserRouter
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                {/* Public, unauthenticated: the one customer-facing route in
                    this staff dashboard -- see SupportPage.tsx. */}
                <Route path="/support" element={<SupportPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <RoleBasedRedirect />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        "admin",
                        "supervisor",
                        "manager",
                        "agent",
                        "viewer",
                      ]}
                    >
                      <Index />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sessions"
                  element={
                    <ProtectedRoute>
                      <SessionsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sessions/:id"
                  element={
                    <ProtectedRoute>
                      <SessionsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/queue"
                  element={
                    <ProtectedRoute
                      allowedRoles={["admin", "supervisor", "manager", "agent"]}
                    >
                      <QueuePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/complaints"
                  element={
                    <ProtectedRoute
                      allowedRoles={["admin", "supervisor", "manager"]}
                    >
                      <ComplaintsPage />
                    </ProtectedRoute>
                  }
                />
                {/* Complaint notifications link to /complaints/{id} (see
                    create_notification in app/api/v1/webhook.py). Without this
                    route that link fell through to NotFound, so the "View"
                    action on every complaint toast led to a 404 page. Same
                    component and guard -- the id opens the detail dialog. */}
                <Route
                  path="/complaints/:complaintId"
                  element={
                    <ProtectedRoute
                      allowedRoles={["admin", "supervisor", "manager"]}
                    >
                      <ComplaintsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/knowledge"
                  element={
                    <ProtectedRoute
                      allowedRoles={["admin", "supervisor", "manager"]}
                    >
                      <KnowledgePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/employees"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        "admin",
                        "supervisor",
                        "manager",
                        "agent",
                        "viewer",
                      ]}
                    >
                      <EmployeesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        "admin",
                        "supervisor",
                        "manager",
                        "agent",
                        "viewer",
                      ]}
                    >
                      <AnalyticsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        "admin",
                        "supervisor",
                        "manager",
                        "agent",
                        "viewer",
                      ]}
                    >
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <ProtectedRoute>
                      <NotificationsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/shortcuts"
                  element={
                    <ProtectedRoute>
                      <ShortcutsPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
