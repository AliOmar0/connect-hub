import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import SessionList, {
  SessionListSkeleton,
} from "@/components/sessions/SessionList";
import { supabase } from "@/integrations/supabase/client";
import {
  Session,
  Customer,
  Employee,
  Profile,
  Message,
  SessionMainType,
  SessionStatus,
} from "@/types/database";
import type { ViewStatus } from "@/types/presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Search,
  Filter,
  Download,
  Users,
  MessageSquare,
  MessageCircle,
  CheckCircle,
  ArrowLeft,
  ChevronDown,
  Inbox,
} from "lucide-react";
import { subDays, isToday } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { toast } from "sonner";
import ChatView from "@/components/messages/ChatView";

import { BACKEND_URL } from "@/lib/config";

// All /api/v1/sessions* routes are protected by verify_jwt on the backend, so
// every call needs the current Supabase access token attached (same pattern
// as KnowledgePage.tsx).
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

interface BackendSession {
  id: string;
  channel: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  employee_id: string | null;
  employee_name: string | null;
  last_message: string;
  status: string;
  started_at: string;
  wait_time_seconds: number | null;
  duration_seconds: number | null;
  satisfaction_score: number | null;
  main_type_id: string | null;
  external_conversation_id: string | null;
}

type FullSession = Session & {
  customer?: Customer;
  employee?: Employee & { profile?: Profile };
};

export default function SessionsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id: sessionIdParam } = useParams<{ id?: string }>();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const breakpoint = useBreakpoint();
  // Below 768px the list and detail become separate navigable views (14.6).
  const isMobile = breakpoint < 768;
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const [savedFilters] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sessions-filters") ?? "{}");
    } catch {
      return {};
    }
  });
  const [searchTerm, setSearchTerm] = useState<string>(
    savedFilters.searchTerm ?? "",
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    savedFilters.statusFilter ?? "all",
  );
  const [channelFilter, setChannelFilter] = useState<string>(
    savedFilters.channelFilter ?? "all",
  );
  const [typeFilter, setTypeFilter] = useState<string>(
    savedFilters.typeFilter ?? "all",
  );
  const [dateRange, setDateRange] = useState<number>(
    savedFilters.dateRange ?? 7,
  ); // days
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">(
    savedFilters.sortOrder === "oldest" ? "oldest" : "newest",
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        "sessions-filters",
        JSON.stringify({
          searchTerm,
          statusFilter,
          channelFilter,
          typeFilter,
          dateRange,
          sortOrder,
        }),
      );
    } catch {
      // ignore
    }
  }, [
    searchTerm,
    statusFilter,
    channelFilter,
    typeFilter,
    dateRange,
    sortOrder,
  ]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [assigningSession, setAssigningSession] = useState<Session | null>(
    null,
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const selectedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSession?.id || null;
  }, [selectedSession?.id]);

  const scrollToChat = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const canAssign =
    userRole === "admin" || userRole === "supervisor" || userRole === "manager";

  // Fetch session types for filtering
  const { data: sessionTypes } = useQuery({
    queryKey: ["session-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_main_types")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching session types:", error);
        return [];
      }
      return (data as unknown as SessionMainType[]) || [];
    },
  });

  const {
    data: sessions,
    isLoading,
    isError: isSessionsError,
    refetch,
  } = useQuery({
    queryKey: [
      "sessions",
      statusFilter,
      channelFilter,
      typeFilter,
      dateRange,
      searchTerm,
    ],
    queryFn: async () => {
      // Fetch from Python Backend
      try {
        const response = await fetch("http://localhost:5000/api/v1/sessions", {
          headers: await authHeaders(),
        });
        if (!response.ok) {
          throw new Error("Failed to fetch sessions from backend");
        }
        const data = await response.json();

        // Map backend response to frontend structure
        let mappedSessions = data.map((s: BackendSession) => ({
          ...s,
          customer: {
            name: s.customer_name,
            phone: s.customer_phone,
            email: s.customer_email,
          },
          employee: s.employee_id
            ? {
                id: s.employee_id,
                profile: {
                  first_name: s.employee_name?.split(" ")[0] || "",
                  last_name:
                    s.employee_name?.split(" ").slice(1).join(" ") || "",
                },
              }
            : undefined,
        }));

        // Client-side filtering (since backend implementation of filtering is partial/missing)
        if (statusFilter !== "all") {
          mappedSessions = mappedSessions.filter(
            (s) => s.status === statusFilter,
          );
        }

        if (channelFilter !== "all") {
          mappedSessions = mappedSessions.filter(
            (s) => s.channel === channelFilter,
          );
        }

        if (typeFilter !== "all") {
          mappedSessions = mappedSessions.filter(
            (s) => s.main_type_id === typeFilter,
          );
        }

        const dateThreshold = subDays(new Date(), dateRange);
        mappedSessions = mappedSessions.filter(
          (s) => new Date(s.started_at) >= dateThreshold,
        );

        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          mappedSessions = mappedSessions.filter(
            (session) =>
              session.customer?.name?.toLowerCase().includes(term) ||
              session.customer?.phone?.toLowerCase().includes(term) ||
              session.customer?.email?.toLowerCase().includes(term) ||
              (session.employee_name &&
                session.employee_name.toLowerCase().includes(term)),
          );
        }

        return mappedSessions as FullSession[];
      } catch (error) {
        console.error("Error fetching sessions from backend:", error);
        // Surface the failure so the view can present an Error_State with a
        // recovery action (Requirement 14.5). Re-throwing keeps the fetch and
        // mapping logic unchanged while enabling react-query's error state.
        throw error instanceof Error
          ? error
          : new Error("Failed to fetch sessions");
      }
    },
  });

  // Sync selected session with route param or default to first
  useEffect(() => {
    if (!sessions || sessions.length === 0) return;

    if (sessionIdParam) {
      const matched = sessions.find((s) => s.id === sessionIdParam);
      if (matched && matched.id !== selectedSession?.id) {
        setSelectedSession(matched);
        return;
      }
    }

    if (!selectedSession) {
      setSelectedSession(sessions[0]);
    }
  }, [sessions, sessionIdParam, selectedSession]);

  // Real-time subscription for active sessions
  useEffect(() => {
    console.log("Setting up global sessions & messages subscription");

    // Subscribe to session changes (status, agent, etc.)
    const sessionChannel = supabase
      .channel("sessions-global-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
        },
        (payload) => {
          console.log("Sessions change received:", payload);
          refetch();
        },
      )
      .subscribe();

    // Subscribe to NEW messages globally to refresh the sidebar snippets
    const messageChannel = supabase
      .channel("messages-global-refresh")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          console.log("Global message received, refreshing list:", payload);
          refetch(); // Refresh sessions list (sidebar)

          // If the message is for the currently selected session, refresh its messages
          const newMessage = payload.new as Message;
          if (
            selectedSessionIdRef.current &&
            newMessage.session_id === selectedSessionIdRef.current
          ) {
            console.log("New message for active session, refreshing ChatView");
            refetchMessages();

            // Proactively update cache for smoothness
            queryClient.setQueryData(
              ["session-messages", selectedSessionIdRef.current],
              (old: Message[] | undefined) => {
                if (!old) return [newMessage];
                if (old.find((m) => m.id === newMessage.id)) return old;
                return [...old, newMessage].sort(
                  (a, b) =>
                    new Date(a.sent_at).valueOf() -
                    new Date(b.sent_at).valueOf(),
                );
              },
            );
          }
        },
      )
      .subscribe();

    return () => {
      console.log("Removing global subscriptions");
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(messageChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  // Fetch available employees for assignment
  const { data: employees } = useQuery({
    queryKey: ["employees-for-assignment"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("*, profile:profiles(*)")
        .eq("is_active", true)
        .order("created_at");
      return (data || []) as Array<Employee & { profile?: Profile }>;
    },
    enabled: canAssign,
  });

  const {
    data: sessionMessages,
    isLoading: messagesLoading,
    isError: isMessagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["session-messages", selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession?.id) return [];

      try {
        const response = await fetch(
          `http://localhost:5000/api/v1/sessions/${selectedSession.id}/messages`,
          { headers: await authHeaders() },
        );
        if (!response.ok) {
          // Fallback to Supabase if backend fails or route 404s?
          // But we want to use backend.
          throw new Error("Failed to fetch messages from backend");
        }
        const data = await response.json();
        return data as Message[];
      } catch (error) {
        console.error("Error fetching messages from backend:", error);
        // Surface the failure so the transcript region can show an Error_State
        // with a recovery action (Requirement 14.5).
        throw error instanceof Error
          ? error
          : new Error("Failed to fetch messages");
      }
    },
    enabled: !!selectedSession?.id,
  });

  // Realtime updates for the selected session (message status)
  useEffect(() => {
    if (!selectedSession?.id) return;

    console.log(`Monitoring session status for: ${selectedSession.id}`);
    const channel = supabase
      .channel(`session-${selectedSession.id}-monitor`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${selectedSession.id}`,
        },
        () => {
          refetchMessages(); // For status updates (delivered/read)
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSession?.id, refetchMessages]);

  const assignMutation = useMutation({
    mutationFn: async ({
      sessionId,
      employeeId,
    }: {
      sessionId: string;
      employeeId: string;
    }) => {
      // Get employee profile to find user_id
      let userId: string | null = null;
      if (employeeId) {
        const { data: employee } = await supabase
          .from("employees")
          .select("profile:profiles(user_id)")
          .eq("id", employeeId)
          .single();
        userId =
          (employee as { profile?: { user_id?: string } })?.profile?.user_id ||
          null;
      }

      // Update session
      const { error: sessionError } = await supabase
        .from("sessions")
        .update({ employee_id: employeeId || null })
        .eq("id", sessionId);

      if (sessionError) throw sessionError;

      // Create notification for assigned employee
      if (userId && employeeId) {
        const session = sessions?.find((s) => s.id === sessionId);
        await supabase.from("notifications").insert({
          user_id: userId,
          title: "New Session Assigned",
          message: `You have been assigned to a ${session?.channel || "new"} session${session?.customer?.name ? ` with ${session.customer.name}` : ""}`,
          type: "info",
          action_url: `/sessions/${sessionId}`,
        });
      }

      return { sessionId, employeeId, userId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(
        data.employeeId
          ? t("sessions.toasts.assigned")
          : t("sessions.toasts.unassigned"),
      );
      setAssignDialogOpen(false);
      setAssigningSession(null);
      setSelectedEmployeeId("unassign");
    },
    onError: (error: Error) => {
      toast.error(error.message || t("sessions.toasts.assignFailed"));
    },
  });

  const handleViewSession = (session: Session) => {
    setSelectedSession(session);
    navigate(`/sessions/${session.id}`);
    // On narrow viewports, switch to the detail view (14.6).
    setMobileView("detail");

    // Automatically scroll to chat view for better flow
    setTimeout(() => {
      scrollToChat();
    }, 100);
  };

  const handleAssignAgent = (session: Session) => {
    setAssigningSession(session);
    setSelectedEmployeeId(session.employee_id || "unassign");
    setAssignDialogOpen(true);
  };

  const handleAssignSubmit = () => {
    if (!assigningSession) {
      toast.error(t("sessions.toasts.noSessionSelected"));
      return;
    }

    // Allow 'unassign' to clear the employee
    const employeeId =
      selectedEmployeeId === "unassign" ? "" : selectedEmployeeId;

    assignMutation.mutate({
      sessionId: assigningSession.id,
      employeeId: employeeId || "",
    });
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedSession) return;

    try {
      // Send via Python Backend
      const response = await fetch(
        `http://localhost:5000/api/v1/sessions/${selectedSession.id}/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeaders()),
          },
          body: JSON.stringify({
            text: content,
          }),
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to send message via backend");
      }

      // Success
      toast.success(t("sessions.toasts.messageSent"));

      // Await refetches and invalidation to ensure UI is in sync
      await refetchMessages();
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      const { data: refreshedSessions } = await refetch();

      // Update the selected session from the freshly fetched list
      if (refreshedSessions) {
        const updated = refreshedSessions.find(
          (s) => s.id === selectedSession.id,
        );
        if (updated) {
          setSelectedSession(updated);
        }
      }
    } catch (err) {
      const error = err as Error;
      console.error("Error sending message:", error);
      toast.error(error.message || t("sessions.toasts.sendFailed"));
    }
  };

  const handleUpdateSessionType = async (typeId: string) => {
    if (!selectedSession) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/v1/sessions/${selectedSession.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeaders()),
          },
          body: JSON.stringify({
            main_type_id: typeId || null,
          }),
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to update session type");
      }

      toast.success(t("sessions.toasts.typeUpdated"));
      // Update local state for immediate feedback
      setSelectedSession({
        ...selectedSession,
        main_type_id: typeId || null,
      });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (err) {
      const error = err as Error;
      console.error("Error updating session type:", error);
      toast.error(error.message || t("sessions.toasts.typeUpdateFailed"));
    }
  };

  const handleUpdateSessionStatus = async (status: string) => {
    if (!selectedSession) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/v1/sessions/${selectedSession.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeaders()),
          },
          body: JSON.stringify({
            status: status,
          }),
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to update session status");
      }

      toast.success(t("sessions.toasts.statusUpdated", { status }));
      queryClient.invalidateQueries({ queryKey: ["sessions"] });

      // Fetch fresh data for duration/wait_time
      setTimeout(async () => {
        const response = await fetch("http://localhost:5000/api/v1/sessions", {
          headers: await authHeaders(),
        });
        if (response.ok) {
          const data = (await response.json()) as BackendSession[];
          const updated = data.find(
            (s: BackendSession) => s.id === selectedSession.id,
          );
          if (updated) {
            setSelectedSession({
              ...selectedSession,
              status: status as SessionStatus,
              duration_seconds: updated.duration_seconds,
              wait_time_seconds: updated.wait_time_seconds,
              satisfaction_score: updated.satisfaction_score,
            });
          }
        }
      }, 300);
    } catch (err) {
      const error = err as Error;
      console.error("Error updating session status:", error);
      toast.error(error.message || t("sessions.toasts.statusUpdateFailed"));
    }
  };

  const handleDownloadSessions = () => {
    if (!sessions || sessions.length === 0) {
      toast.error(t("sessions.toasts.noSessions"));
      return;
    }

    const headers = [
      "ID",
      "Customer",
      "Phone",
      "Email",
      "Agent",
      "Channel",
      "Status",
      "Wait Time (s)",
      "Duration (s)",
      "Satisfaction",
      "Started At",
    ];

    const rows = sessions.map((s) => [
      s.id,
      s.customer?.name || "Unknown",
      s.customer?.phone || "-",
      s.customer?.email || "-",
      s.employee?.profile
        ? `${s.employee.profile.first_name} ${s.employee.profile.last_name}`.trim()
        : "Unassigned",
      s.channel,
      s.status,
      s.wait_time_seconds || 0,
      s.duration_seconds || 0,
      s.satisfaction_score || "-",
      new Date(s.started_at).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `sessions_export_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t("sessions.toasts.exported"));
  };

  // Derive the list view's ViewStatus for the shared AsyncBoundary so loading,
  // empty (14.3), and error (14.5) states use the standard feedback patterns.
  const listStatus: ViewStatus = isLoading
    ? "loading"
    : isSessionsError
      ? "error"
      : (sessions?.length ?? 0) === 0
        ? "empty"
        : "loaded";

  const hasSelection = !!selectedSession;

  // On narrow viewports show either the list or the detail as a separate
  // navigable view; at >=768px both are visible (14.1 / 14.6).
  const showList = !isMobile || mobileView === "list";
  const showDetail = !isMobile || mobileView === "detail";

  // The rail's own order, independent of the filters above it. Newest first
  // by default, matching the order sessions arrive in.
  const sortedSessions = useMemo(() => {
    if (!sessions) return sessions;
    const sorted = [...sessions].sort((a, b) => {
      const diff =
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
    return sorted;
  }, [sessions, sortOrder]);

  // Inline status tallies. Four tinted stat cards used to sit above the list
  // restating what the list already showed; the same three numbers now ride
  // in the toolbar where the filters are.
  const tallies = [
    {
      key: "active",
      dot: "bg-status-success",
      label: t("sessions.stats.activeSessions"),
      count: sessions?.filter((s) => s.status === "active").length ?? 0,
    },
    {
      key: "waiting",
      dot: "bg-status-warning",
      label: t("sessions.status.waiting"),
      count: sessions?.filter((s) => s.status === "waiting").length ?? 0,
    },
    {
      key: "closedToday",
      dot: "bg-status-neutral",
      label: t("sessions.stats.closedToday"),
      count:
        sessions?.filter(
          (s) =>
            (s.status === "completed" || s.status === "auto_closed") &&
            isToday(new Date(s.started_at)),
        ).length ?? 0,
    },
  ];

  const listSection = (
    <AsyncBoundary
      status={listStatus}
      className="flex min-h-0 flex-1 flex-col"
      onRetry={() => refetch()}
      emptyTitle={t("sessions.emptyList.title")}
      emptyDescription={t("sessions.emptyList.description")}
      emptyIcon={<Inbox />}
      skeleton={
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <SessionListSkeleton />
        </div>
      }
    >
      <SessionList
        sessions={sortedSessions || []}
        sessionTypes={sessionTypes}
        selectedId={selectedSession?.id ?? null}
        onSelect={handleViewSession}
        className="h-full"
        headerAction={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("sessions.list.sortLabel")}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-caption font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {sortOrder === "newest"
                  ? t("sessions.list.sortNewest")
                  : t("sessions.list.sortOldest")}
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortOrder("newest")}>
                {t("sessions.list.sortNewest")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOrder("oldest")}>
                {t("sessions.list.sortOldest")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </AsyncBoundary>
  );

  const detailSection = (
    // The conversation pane sits beside the rail rather than below it, so the
    // two are one console instead of two stacked pages. Only the phone layout
    // still swaps between them.
    <section
      aria-label={t("sessions.conversationDetails")}
      className="flex min-h-0 flex-1 flex-col gap-4"
      ref={chatContainerRef}
    >
      {isMobile && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMobileView("list")}
          className="w-fit min-h-[44px] gap-2"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          {t("sessions.backToList")}
        </Button>
      )}

      {!hasSelection ? (
        // No session selected -> direct the user to pick one (14.2).
        <EmptyState
          title={t("sessions.noSelection.title")}
          description={t("sessions.noSelection.description")}
          icon={<MessageSquare />}
        />
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col gap-3"
          id="chat-view-container"
        >
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border shadow-card">
            <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
              <ChatView
                session={selectedSession}
                messages={sessionMessages || []}
                onSendMessage={handleSendMessage}
                onUpdateType={handleUpdateSessionType}
                onUpdateStatus={handleUpdateSessionStatus}
                sessionTypes={sessionTypes}
                loading={messagesLoading}
                error={isMessagesError}
                onRetryMessages={() => refetchMessages()}
                onAssignAgent={
                  canAssign
                    ? () => handleAssignAgent(selectedSession)
                    : undefined
                }
                onEscalate={() => handleUpdateSessionStatus("escalated")}
                onViewActivity={() =>
                  navigate(`/sessions/${selectedSession.id}/activity`)
                }
              />
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );

  return (
    <DashboardLayout>
      {/* One tall console: the page itself does not scroll, each pane does.
          113px is the shell chrome above this box: the 64px header row (+1px
          border) plus DashboardLayout's 24px top/bottom <main> padding. The
          previous 8.5rem (136px) over-subtracted by 23px, leaving that much
          dead space below the console instead of giving it to the chat. */}
      <div className="flex h-[calc(100vh-113px)] min-h-0 flex-col gap-4">
        <PageHeader
          title={t("sessions.title")}
          description={t("sessions.subtitle")}
          actions={
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={handleDownloadSessions}
            >
              <Download className="h-4 w-4 me-2" aria-hidden="true" />
              {t("sessions.exportCsv")}
            </Button>
          }
        />

        {/* One toolbar row. The filters used to live in a 130-line Card of
            their own above four tinted stat cards, so two thirds of the screen
            was chrome before the first conversation. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[320px]">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("sessions.searchPlaceholder")}
              aria-label={t("sessions.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 rtl:pl-3 rtl:pr-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="w-full sm:w-[150px]"
              aria-label={t("sessions.filters.status")}
            >
              <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
              <SelectValue placeholder={t("sessions.filters.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("sessions.filters.allStatus")}
              </SelectItem>
              <SelectItem value="active">
                {t("sessions.status.active")}
              </SelectItem>
              <SelectItem value="waiting">
                {t("sessions.status.waiting")}
              </SelectItem>
              <SelectItem value="completed">
                {t("sessions.status.completed")}
              </SelectItem>
              <SelectItem value="escalated">
                {t("sessions.status.escalated")}
              </SelectItem>
              <SelectItem value="auto_closed">
                {t("sessions.status.auto_closed")}
              </SelectItem>
              <SelectItem value="missed">
                {t("sessions.status.missed")}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger
              className="w-full sm:w-[180px]"
              aria-label={t("sessions.filters.channel")}
            >
              <SelectValue placeholder={t("sessions.filters.channel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("sessions.filters.allChannels")}
              </SelectItem>
              <SelectItem value="whatsapp">
                {t("sessions.channels.whatsapp")}
              </SelectItem>
              <SelectItem value="messenger">
                {t("sessions.channels.messenger")}
              </SelectItem>
              <SelectItem value="sms">{t("sessions.channels.sms")}</SelectItem>
              <SelectItem value="voice">
                {t("sessions.channels.voice")}
              </SelectItem>
              <SelectItem value="email">
                {t("sessions.channels.email")}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger
              className="w-full sm:w-[180px]"
              aria-label={t("sessions.filters.type")}
            >
              <SelectValue placeholder={t("sessions.filters.type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("sessions.filters.allTypes")}
              </SelectItem>
              {sessionTypes?.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={dateRange.toString()}
            onValueChange={(v) => setDateRange(parseInt(v))}
          >
            <SelectTrigger
              className="w-full sm:w-[180px]"
              aria-label={t("sessions.filters.dateRange")}
            >
              <SelectValue placeholder={t("sessions.filters.dateRange")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("sessions.filters.last24h")}</SelectItem>
              <SelectItem value="7">{t("sessions.filters.last7d")}</SelectItem>
              <SelectItem value="30">
                {t("sessions.filters.last30d")}
              </SelectItem>
              <SelectItem value="90">
                {t("sessions.filters.last90d")}
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Tallies, not stat cards. */}
          <div className="ms-auto flex flex-wrap items-center gap-4">
            {tallies.map((tally) => (
              <span key={tally.key} className="flex items-center gap-1.5">
                <span
                  className={cn("h-2 w-2 rounded-full", tally.dot)}
                  aria-hidden="true"
                />
                <span className="text-body-sm text-muted-foreground">
                  {tally.label}
                </span>
                <span className="text-body-sm font-bold tabular-nums text-foreground">
                  {tally.count}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Two panes, one console. The rail holds a fixed 420px on a wide
            screen; below `lg` the phone swaps between list and conversation. */}
        <div className="flex min-h-0 flex-1 gap-5">
          {showList && (
            // Named region rather than a visible "Sessions Overview" heading:
            // the rail's own header already says what it holds, so the heading
            // was a second label for the same thing.
            <section
              aria-label={t("sessions.overviewTitle")}
              className="flex min-h-0 w-full flex-col lg:w-[420px] lg:shrink-0"
            >
              {listSection}
            </section>
          )}
          {showDetail && detailSection}
        </div>

        {/* Assign Agent Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("sessions.assign.title")}</DialogTitle>
              <DialogDescription>
                {t("sessions.assign.description")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {assigningSession && (
                <div className="space-y-2">
                  <Label>{t("sessions.assign.sessionLabel")}</Label>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium">
                      {assigningSession.customer?.name ||
                        t("sessions.table.unknown")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("sessions.assign.channelStatus", {
                        channel: assigningSession.channel,
                        status: assigningSession.status,
                      })}
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="employee">
                  {t("sessions.assign.selectEmployee")}
                </Label>
                <Select
                  value={selectedEmployeeId}
                  onValueChange={setSelectedEmployeeId}
                >
                  <SelectTrigger id="employee">
                    <SelectValue
                      placeholder={t("sessions.assign.chooseEmployee")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassign">
                      {t("sessions.table.aiAgent")}
                    </SelectItem>
                    {employees?.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.profile
                          ? `${emp.profile.first_name || ""} ${emp.profile.last_name || ""}`.trim() ||
                            emp.employee_code ||
                            t("sessions.table.unknown")
                          : emp.employee_code || t("sessions.table.unknown")}
                        {emp.department && ` • ${emp.department}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignDialogOpen(false);
                    setAssigningSession(null);
                    setSelectedEmployeeId("unassign");
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleAssignSubmit}
                  disabled={assignMutation.isPending}
                >
                  {assignMutation.isPending
                    ? t("sessions.assign.assigning")
                    : t("sessions.assign.assign")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
