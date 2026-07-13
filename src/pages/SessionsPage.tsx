import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SessionsTable from "@/components/sessions/SessionsTable";
import { supabase } from "@/integrations/supabase/client";
import {
  Session,
  Customer,
  Employee,
  Profile,
  Message,
  Call,
  SessionMainType,
  SessionStatus,
} from "@/types/database";
import type { ViewStatus } from "@/types/presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { BidiText } from "@/components/ui/bidi-text";
import {
  Search,
  Filter,
  Download,
  Users,
  Phone,
  MessageSquare,
  MessageCircle,
  Clock,
  CheckCircle,
  ArrowLeft,
  Inbox,
} from "lucide-react";
import { subDays } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { toast } from "sonner";
import ChatView from "@/components/messages/ChatView";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<number>(7); // days
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

  const {
    data: sessionCalls,
    isLoading: callsLoading,
    refetch: refetchCalls,
  } = useQuery({
    queryKey: ["session-calls", selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession?.id) return [];
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("session_id", selectedSession.id)
        .order("started_at", { ascending: false });

      if (error) {
        console.error("Error fetching calls:", error);
        return [];
      }

      return (data || []) as Call[];
    },
    enabled: !!selectedSession?.id,
  });

  // Realtime updates for the selected session (calls + updates)
  useEffect(() => {
    if (!selectedSession?.id) return;

    console.log(`Monitoring session status/calls for: ${selectedSession.id}`);
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
          filter: `session_id=eq.${selectedSession.id}`,
        },
        (payload) => {
          console.log("Call change received:", payload);
          refetchCalls();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSession?.id, refetchMessages, refetchCalls]);

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

  const listSection = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("sessions.overviewTitle")}
        </h2>
      </div>
      <AsyncBoundary
        status={listStatus}
        onRetry={() => refetch()}
        emptyTitle={t("sessions.emptyList.title")}
        emptyDescription={t("sessions.emptyList.description")}
        emptyIcon={<Inbox />}
        skeleton={
          <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
            <SessionsTable sessions={[]} loading />
          </div>
        }
      >
        <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm max-h-[450px] overflow-y-auto custom-scrollbar">
          <SessionsTable
            sessions={sessions || []}
            sessionTypes={sessionTypes}
            loading={false}
            onViewSession={handleViewSession}
            onAssignAgent={canAssign ? handleAssignAgent : undefined}
          />
        </div>
      </AsyncBoundary>
    </div>
  );

  const detailSection = (
    <div
      className="border-t border-border pt-8 mt-4 space-y-4"
      ref={chatContainerRef}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileView("list")}
              aria-label={t("sessions.backToList")}
              className="shrink-0"
            >
              <ArrowLeft
                className="h-5 w-5 rtl:rotate-180"
                aria-hidden="true"
              />
            </Button>
          )}
          <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
          {t("sessions.conversationDetails")}
        </h2>
      </div>

      {!hasSelection ? (
        // No session selected -> direct the user to pick one (14.2).
        <EmptyState
          title={t("sessions.noSelection.title")}
          description={t("sessions.noSelection.description")}
          icon={<MessageSquare />}
        />
      ) : (
        <div
          className="grid lg:grid-cols-3 gap-6 h-[800px]"
          id="chat-view-container"
        >
          <Card className="lg:col-span-2 flex flex-col overflow-hidden border-border/60 shadow-md">
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
              />
            </CardContent>
          </Card>

          <Card className="flex flex-col overflow-hidden border-border/60 shadow-md">
            <CardContent className="p-6 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div>
                  <h3 className="text-lg font-semibold">
                    {t("sessions.activity.title")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("sessions.activity.subtitle")}
                  </p>
                </div>
                {selectedSession && (
                  <Badge className="font-medium px-3 py-1">
                    {t(`sessions.status.${selectedSession.status}`, {
                      defaultValue: selectedSession.status,
                    })}
                  </Badge>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                {callsLoading ? (
                  [...Array(4)].map((_, idx) => (
                    <div
                      key={idx}
                      className="h-20 rounded-xl bg-muted animate-pulse"
                    />
                  ))
                ) : sessionCalls && sessionCalls.length > 0 ? (
                  sessionCalls.map((call) => (
                    <div
                      key={call.id}
                      className="rounded-xl border border-border p-4 bg-muted/20 space-y-2 hover:border-primary/20 hover:bg-muted/40 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold flex items-center gap-2">
                          {call.direction === "inbound" ? (
                            <div className="w-2.5 h-2.5 rounded-full bg-status-info"></div>
                          ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-status-success"></div>
                          )}
                          {call.direction === "inbound"
                            ? t("sessions.activity.inboundCall")
                            : t("sessions.activity.outboundCall")}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {new Date(call.started_at).toLocaleString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="bg-background/50 p-2 rounded-lg border border-border/50">
                          <span className="block opacity-60">
                            {t("sessions.activity.status")}
                          </span>
                          <span className="font-medium text-foreground">
                            {call.status}
                          </span>
                        </div>
                        <div className="bg-background/50 p-2 rounded-lg border border-border/50">
                          <span className="block opacity-60">
                            {t("sessions.activity.duration")}
                          </span>
                          <span className="font-medium text-foreground">
                            {call.duration_seconds
                              ? `${call.duration_seconds}s`
                              : "0s"}
                          </span>
                        </div>
                      </div>
                      {call.phone_number && (
                        <p className="text-xs text-muted-foreground px-1 flex items-center gap-1">
                          <span className="opacity-60">
                            {t("sessions.activity.id")}:
                          </span>{" "}
                          <BidiText value={call.phone_number} />
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <Phone className="h-10 w-10 mb-4" aria-hidden="true" />
                    <p className="text-sm font-medium">
                      {t("sessions.activity.empty")}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-8 pb-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-display font-bold tracking-tight">
            {t("sessions.title")}
          </h1>
          <p className="text-muted-foreground">{t("sessions.subtitle")}</p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
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
                  <SelectItem value="sms">
                    {t("sessions.channels.sms")}
                  </SelectItem>
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
                  <SelectItem value="1">
                    {t("sessions.filters.last24h")}
                  </SelectItem>
                  <SelectItem value="7">
                    {t("sessions.filters.last7d")}
                  </SelectItem>
                  <SelectItem value="30">
                    {t("sessions.filters.last30d")}
                  </SelectItem>
                  <SelectItem value="90">
                    {t("sessions.filters.last90d")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleDownloadSessions}
                variant="outline"
                size="icon"
                className="border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-all text-primary"
                title={t("sessions.exportCsv")}
                aria-label={t("sessions.exportCsv")}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Simple Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          <Card className="bg-status-success/5 border-status-success/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {t("sessions.stats.activeSessions")}
                </p>
                <h4 className="text-xl font-bold text-status-success">
                  {sessions?.filter((s) => s.status === "active").length || 0}
                </h4>
              </div>
              <div className="p-2 bg-status-success/10 rounded-lg text-status-success">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-status-error/5 border-status-error/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {t("sessions.stats.escalated")}
                </p>
                <h4 className="text-xl font-bold text-status-error">
                  {sessions?.filter((s) => s.status === "escalated").length ||
                    0}
                </h4>
              </div>
              <div className="p-2 bg-status-error/10 rounded-lg text-status-error">
                <Clock className="h-4 w-4" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-status-info/5 border-status-info/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {t("sessions.stats.completed")}
                </p>
                <h4 className="text-xl font-bold text-status-info">
                  {sessions?.filter((s) => s.status === "completed").length ||
                    0}
                </h4>
              </div>
              <div className="p-2 bg-status-info/10 rounded-lg text-status-info">
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {t("sessions.stats.totalAgents")}
                </p>
                <h4 className="text-xl font-bold text-primary">
                  {employees?.length || 0}
                </h4>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Users className="h-4 w-4" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        </div>

        {showList && listSection}
        {showDetail && detailSection}

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
                      {t("sessions.assign.unassign")}
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
