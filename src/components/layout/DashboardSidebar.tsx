import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Phone,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Headphones,
  BarChart3,
  Bell,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import pibLogo from "@/assets/pib-logo.png";

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  badge?: number;
}

const NavItem = ({ to, icon: Icon, label, collapsed, badge }: NavItemProps) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  const content = (
    <NavLink
      to={to}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-glow"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-sidebar-primary-foreground")} />
      {!collapsed && (
        <span className="font-medium text-sm">{label}</span>
      )}
      {badge !== undefined && badge > 0 && (
        <span className={cn(
          "absolute flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full",
          collapsed ? "top-0 right-0" : "right-3",
          isActive ? "bg-sidebar-background text-sidebar-primary" : "bg-gold text-navy-dark"
        )}>
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

  const mainNavItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/messages", icon: MessageSquare, label: "Messages", badge: 12 },
    { to: "/calls", icon: Phone, label: "Calls", badge: 3 },
    { to: "/sessions", icon: Headphones, label: "Active Sessions", badge: 5 },
    { to: "/employees", icon: Users, label: "Employees" },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
  ];

  const secondaryNavItems = [
    { to: "/notifications", icon: Bell, label: "Notifications", badge: 8 },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <aside
      className={cn(
        "h-screen bg-sidebar flex flex-col transition-all duration-300 ease-in-out border-r border-sidebar-border",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 px-4 border-b border-sidebar-border",
        collapsed ? "justify-center" : "gap-3"
      )}>
        <img src={pibLogo} alt="PIB Logo" className="h-10 w-10 object-contain" />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-display font-bold text-sm text-sidebar-foreground leading-tight">
              Palestinian Islamic
            </span>
            <span className="font-display font-bold text-sm text-sidebar-primary leading-tight">
              Bank
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
      <div className={cn(
        "p-3 border-t border-sidebar-border",
        collapsed ? "flex justify-center" : ""
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
            <div className="w-9 h-9 rounded-full bg-gradient-navy-gold flex items-center justify-center text-primary-foreground font-semibold text-sm">
              AM
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                Ahmad Mansour
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                Administrator
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="w-9 h-9 rounded-full bg-gradient-navy-gold flex items-center justify-center text-primary-foreground font-semibold text-sm">
                AM
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="font-medium">Ahmad Mansour</p>
              <p className="text-xs text-muted-foreground">Administrator</p>
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
          className={cn(
            "w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
