import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  requireRole?: "admin" | "supervisor" | "manager" | "agent" | "viewer";
  allowedRoles?: ("admin" | "supervisor" | "manager" | "agent" | "viewer")[];
}

export default function ProtectedRoute({
  children,
  requireRole,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, userRole, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user has required role level
  if (requireRole) {
    const roleHierarchy: Record<string, number> = {
      viewer: 0,
      agent: 1,
      manager: 2,
      supervisor: 2,
      admin: 3,
    };

    const userLevel = roleHierarchy[userRole || "viewer"] || 0;
    const requiredLevel = roleHierarchy[requireRole] || 0;

    if (userLevel < requiredLevel) {
      // Redirect agents to messages page if they try to access restricted pages
      if (userRole === "agent") {
        return <Navigate to="/sessions" replace />;
      }
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground">
              You don't have permission to access this page.
            </p>
          </div>
        </div>
      );
    }
  }

  // Check if user role is in allowed roles list
  if (allowedRoles && !allowedRoles.includes(userRole || "viewer")) {
    if (userRole === "agent") {
      return <Navigate to="/sessions" replace />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

