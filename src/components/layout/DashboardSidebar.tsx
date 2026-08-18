import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Headphones,
  BarChart3,
  Bell,
  LogOut,
  Zap,
  Inbox,
  BookOpen,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import pibLogo from "@/assets/pib-logo.png";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  badge?: number;
}

const NavItem = ({ to, icon: Icon, label, collapsed, badge }: NavItemProps) => {
  const location = useLocation();
  const isActive =
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  const content = (
    <NavLink
      to={to}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 flex-shrink-0",
          isActive && "text-sidebar-primary-foreground",
        )}
      />
      {!collapsed && <span className="font-medium text-sm">{label}</span>}
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "absolute flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full",
            collapsed ? "top-0 right-0" : "right-3",
            isActive
              ? "bg-sidebar-background text-sidebar-primary"
              : "bg-gold text-navy-dark",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {label}
          {badge !== undefined && badge > 0 && (
            <span className="ml-2 bg-gold text-navy-dark px-1.5 py-0.5 rounded-full text-xs">
              {badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
};

export default function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, userRole, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch real notification count
  const { data: unreadNotifications } = useQuery({
    queryKey: ["unread-notifications-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // Fetch real count for active sessions
  const { data: activeSessionsCount } = useQuery({
    queryKey: ["active-sessions-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      return count || 0;
    },
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const getUserName = () => {
    if (profile?.first_name || profile?.last_name) {
      return `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    }
    return user?.email?.split("@")[0] || t("appShell.sidebar.userFallback");
  };

  const getUserInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    if (profile?.first_name) {
      return profile.first_name[0].toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getRoleLabel = () => {
    const roleLabels: Record<string, string> = {
      admin: t("appShell.roles.admin"),
      supervisor: t("appShell.roles.supervisor"),
      manager: t("appShell.roles.manager"),
      agent: t("appShell.roles.agent"),
      viewer: t("appShell.roles.viewer"),
    };
    return roleLabels[userRole || "viewer"] || t("appShell.roles.user");
  };

  // Define all navigation items with real badge counts
  const allMainNavItems = [
    {
      to: "/dashboard",
      icon: LayoutDashboard,
      label: t("appShell.nav.dashboard"),
      roles: ["admin", "supervisor", "manager", "viewer"],
    },
    {
      to: "/sessions",
      icon: Headphones,
      label: t("appShell.nav.sessions"),
      badge: activeSessionsCount || 0,
      roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    },
    {
      to: "/queue",
      icon: Inbox,
      label: t("appShell.nav.queue"),
      roles: ["admin", "supervisor", "manager", "agent"],
    },
    {
      to: "/employees",
      icon: Users,
      label: t("appShell.nav.employees"),
      roles: ["admin", "supervisor", "manager"],
    },
    {
      to: "/analytics",
      icon: BarChart3,
      label: t("appShell.nav.analytics"),
      roles: ["admin", "supervisor", "manager"],
    },
  ];

  const allSecondaryNavItems = [
    {
      to: "/notifications",
      icon: Bell,
      label: t("appShell.nav.notifications"),
      badge: unreadNotifications || 0,
      roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    },
    {
      to: "/shortcuts",
      icon: Zap,
      label: t("appShell.nav.shortcuts"),
      roles: ["admin", "supervisor", "manager", "agent"],
    },
    {
      to: "/knowledge",
      icon: BookOpen,
      label: t("appShell.nav.knowledge"),
      roles: ["admin", "supervisor", "manager"],
    },
    {
      to: "/settings",
      icon: Settings,
      label: t("appShell.nav.settings"),
      roles: ["admin", "supervisor", "manager", "agent", "viewer"],
    },
  ];

  // Filter navigation items based on user role
  const mainNavItems = allMainNavItems.filter(
    (item) => !item.roles || item.roles.includes(userRole || "viewer"),
  );

  const secondaryNavItems = allSecondaryNavItems.filter(
    (item) => !item.roles || item.roles.includes(userRole || "viewer"),
  );

  return (
    <aside
      className={cn(
        "h-screen bg-sidebar flex flex-col transition-all duration-300 ease-in-out border-r border-sidebar-border",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center h-16 px-4 border-b border-sidebar-border",
          collapsed ? "justify-center" : "gap-3",
        )}
      >
        <img
          src={pibLogo}
          alt={t("appShell.sidebar.logoAlt")}
          className="h-10 w-10 object-contain"
        />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-display font-bold text-sm text-sidebar-foreground leading-tight">
              {t("appShell.sidebar.bankNameLine1")}
            </span>
            <span className="font-display font-bold text-sm text-sidebar-primary leading-tight">
              {t("appShell.sidebar.bankNameLine2")}
            </span>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="space-y-1">
          {mainNavItems.map((item) => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>

        <div className="my-4 border-t border-sidebar-border" />

        <div className="space-y-1">
          {secondaryNavItems.map((item) => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {/* User Section */}
      <div
        className={cn(
          "p-3 border-t border-sidebar-border",
          collapsed ? "flex justify-center" : "",
        )}
      >
        {!collapsed ? (
          <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
            <Avatar className="h-9 w-9 border border-sidebar-border shadow-sm">
              <AvatarImage
                src={profile?.avatar_url || ""}
                alt={getUserName()}
              />
              <AvatarFallback className="bg-gradient-navy-gold text-white font-semibold text-xs">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {getUserName()}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {getRoleLabel()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground"
              onClick={handleSignOut}
              aria-label={t("appShell.sidebar.signOut")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex items-center justify-center"
                onClick={handleSignOut}
                aria-label={t("appShell.sidebar.signOut")}
              >
                <Avatar className="h-9 w-9 border border-sidebar-border shadow-sm hover:ring-2 hover:ring-sidebar-primary transition-all">
                  <AvatarImage
                    src={profile?.avatar_url || ""}
                    alt={getUserName()}
                  />
                  <AvatarFallback className="bg-gradient-navy-gold text-white font-semibold text-xs">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="font-medium">{getUserName()}</p>
              <p className="text-xs text-muted-foreground">{getRoleLabel()}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Collapse Toggle */}
      <div className="p-3 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={
            collapsed
              ? t("appShell.sidebar.expandSidebar")
              : t("appShell.sidebar.collapseSidebar")
          }
          className={cn(
            "w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent",
            collapsed && "justify-center",
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>{t("appShell.sidebar.collapse")}</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
