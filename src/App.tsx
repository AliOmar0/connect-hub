import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
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
import NotFound from "./pages/NotFound";

import EscalationListener from "@/components/EscalationListener";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <EscalationListener />
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
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
                  allowedRoles={["supervisor", "manager", "admin"]}
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
              path="/employees"
              element={
                <ProtectedRoute
                  allowedRoles={["supervisor", "manager", "admin"]}
                >
                  <EmployeesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute
                  allowedRoles={["supervisor", "manager", "admin"]}
                >
                  <AnalyticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute
                  allowedRoles={["supervisor", "manager", "admin"]}
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
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
