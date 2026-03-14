import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { subDays } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ChatView from "@/components/messages/ChatView";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

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
  const { id: sessionIdParam } = useParams<{ id?: string }>();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
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
        const response = await fetch("http://localhost:5000/api/v1/sessions");
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
        // Fallback to empty or handle error
        return [];
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
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["session-messages", selectedSession?.id],
    queryFn: async () => {
      if (!selectedSession?.id) return [];

      try {
        const response = await fetch(
          `http://localhost:5000/api/v1/sessions/${selectedSession.id}/messages`,
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
        return [];
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
          ? "Session assigned successfully"
          : "Session unassigned",
      );
      setAssignDialogOpen(false);
      setAssigningSession(null);
      setSelectedEmployeeId("unassign");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to assign session");
    },
  });

  const handleViewSession = (session: Session) => {
    setSelectedSession(session);
    navigate(`/sessions/${session.id}`);

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
      toast.error("No session selected");
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
      toast.success("Message sent");

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
      toast.error(error.message || "Failed to send message");
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

      toast.success("Session type updated");
      // Update local state for immediate feedback
      setSelectedSession({
        ...selectedSession,
        main_type_id: typeId || null,
      });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (err) {
      const error = err as Error;
      console.error("Error updating session type:", error);
      toast.error(error.message || "Failed to update session type");
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

      toast.success(`Session marked as ${status}`);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });

      // Fetch fresh data for duration/wait_time
      setTimeout(async () => {
        const response = await fetch("http://localhost:5000/api/v1/sessions");
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
      toast.error(error.message || "Failed to update session status");
    }
  };

  const handleDownloadSessions = () => {
    if (sessions.length === 0) {
      toast.error("No sessions to download");
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
    toast.success("Sessions exported correctly");
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-8 pb-10">
        <div className="flex flex-col gap-1">
          <h1
            className="text-3xl font-display font-bold tracking-tight cursor-pointer hover:text-primary transition-colors inline-block"
            onClick={scrollToChat}
          >
            Active AI Sessions
          </h1>
          <p className="text-muted-foreground">
            Monitor and manage all active sessions.{" "}
            <span
              className="text-primary/70 font-medium cursor-pointer hover:underline"
              onClick={scrollToChat}
            >
              Jump to Chat ↓
            </span>
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer, phone, email, or agent..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="waiting">Waiting</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="messenger">Messenger</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="voice">Voice</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
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
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24 hours</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleDownloadSessions}
                variant="outline"
                size="icon"
                className="border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-all text-primary"
                title="Export filtered sessions to CSV"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Simple Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          <Card className="bg-primary/5 border-primary/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Active Sessions
                </p>
                <h4 className="text-xl font-bold text-primary">
                  {sessions?.filter((s) => s.status === "active").length || 0}
                </h4>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <MessageCircle className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-orange-500/5 border-orange-500/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Escalated
                </p>
                <h4 className="text-xl font-bold text-orange-600">
                  {sessions?.filter((s) => s.status === "escalated").length ||
                    0}
                </h4>
              </div>
              <div className="p-2 bg-orange-500/10 rounded-lg text-orange-600">
                <Clock className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-500/5 border-green-500/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Completed (24h)
                </p>
                <h4 className="text-xl font-bold text-green-600">
                  {sessions?.filter((s) => s.status === "completed").length ||
                    0}
                </h4>
              </div>
              <div className="p-2 bg-green-500/10 rounded-lg text-green-600">
                <CheckCircle className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/5 border-blue-500/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Total Agents
                </p>
                <h4 className="text-xl font-bold text-blue-600">
                  {employees?.length || 0}
                </h4>
              </div>
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600">
                <Users className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Sessions Overview
            </h2>
          </div>
          <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm max-h-[450px] overflow-y-auto custom-scrollbar">
            <SessionsTable
              sessions={sessions || []}
              sessionTypes={sessionTypes}
              loading={isLoading}
              onViewSession={handleViewSession}
              onAssignAgent={canAssign ? handleAssignAgent : undefined}
            />
          </div>
        </div>

        {/* Separator */}
        <div
          className="border-t border-border pt-8 mt-4"
          ref={chatContainerRef}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Conversation Details
            </h2>
          </div>
        </div>

        {/* Chat & Activity Section - Stacked or Side-by-Side with fixed height for stability */}
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
              />
            </CardContent>
          </Card>

          <Card className="flex flex-col overflow-hidden border-border/60 shadow-md">
            <CardContent className="p-6 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div>
                  <h3 className="text-lg font-semibold">Activity Timeline</h3>
                  <p className="text-sm text-muted-foreground">
                    Call history and updates
                  </p>
                </div>
                {selectedSession && (
                  <Badge className="capitalize font-medium px-3 py-1">
                    {selectedSession.status}
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
                        <span className="text-sm font-semibold capitalize flex items-center gap-2">
                          {call.direction === "inbound" ? (
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
                          ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                          )}
                          {call.direction} Call
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
                          <span className="block opacity-60">Status</span>
                          <span className="font-medium text-foreground">
                            {call.status}
                          </span>
                        </div>
                        <div className="bg-background/50 p-2 rounded-lg border border-border/50">
                          <span className="block opacity-60">Duration</span>
                          <span className="font-medium text-foreground">
                            {call.duration_seconds
                              ? `${call.duration_seconds}s`
                              : "0s"}
                          </span>
                        </div>
                      </div>
                      {call.phone_number && (
                        <p className="text-xs text-muted-foreground px-1">
                          <span className="opacity-60">ID:</span>{" "}
                          {call.phone_number}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <Phone className="h-10 w-10 mb-4" />
                    <p className="text-sm font-medium">No activity yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Assign Agent Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Agent to Session</DialogTitle>
              <DialogDescription>
                Select an employee to assign to this session.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {assigningSession && (
                <div className="space-y-2">
                  <Label>Session</Label>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium">
                      {assigningSession.customer?.name || "Unknown Customer"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Channel: {assigningSession.channel} • Status:{" "}
                      {assigningSession.status}
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="employee">Select Employee</Label>
                <Select
                  value={selectedEmployeeId}
                  onValueChange={setSelectedEmployeeId}
                >
                  <SelectTrigger id="employee">
                    <SelectValue placeholder="Choose an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassign">Unassign</SelectItem>
                    {employees?.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.profile
                          ? `${emp.profile.first_name || ""} ${emp.profile.last_name || ""}`.trim() ||
                            emp.employee_code ||
                            "Unknown"
                          : emp.employee_code || "Unknown"}
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
                  Cancel
                </Button>
                <Button
                  onClick={handleAssignSubmit}
                  disabled={assignMutation.isPending}
                >
                  {assignMutation.isPending ? "Assigning..." : "Assign"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
