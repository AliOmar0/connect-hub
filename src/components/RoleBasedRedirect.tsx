import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function RoleBasedRedirect() {
  const { userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect agents to Active AI Sessions page
  if (userRole === "agent") {
    return <Navigate to="/sessions" replace />;
  }

  // For other roles (admin, supervisor, manager, viewer), redirect to dashboard
  return <Navigate to="/dashboard" replace />;
}
