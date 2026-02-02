import { useState, useEffect } from "react";
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
import { Search, Filter, Download } from "lucide-react";
import { subDays } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ChatView from "@/components/messages/ChatView";

export default function SessionsPage() {
  const navigate = useNavigate();
  const { id: sessionIdParam } = useParams<{ id?: string }>();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<number>(7); // days
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const canAssign =
    userRole === "admin" || userRole === "supervisor" || userRole === "manager";

  const {
    data: sessions,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["sessions", statusFilter, channelFilter, dateRange, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("sessions")
        .select(
          "*, customer:customers(*), employee:employees(*, profile:profiles(*))",
        )
        .order("started_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (channelFilter !== "all") {
        query = query.eq("channel", channelFilter);
      }

      const dateThreshold = subDays(new Date(), dateRange);
      query = query.gte("started_at", dateThreshold.toISOString());

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching sessions:", error);
        return [];
      }

      // Client-side search filtering
      let filtered = (data || []) as Array<
        Session & {
          customer?: Customer;
          employee?: Employee & { profile?: Profile };
        }
      >;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (session) =>
            session.customer?.name?.toLowerCase().includes(term) ||
            session.customer?.phone?.toLowerCase().includes(term) ||
            session.customer?.email?.toLowerCase().includes(term) ||
            session.employee?.profile?.first_name
              ?.toLowerCase()
              .includes(term) ||
            session.employee?.profile?.last_name?.toLowerCase().includes(term),
        );
      }

      return filtered;
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
    const channel = supabase
      .channel("sessions-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
        },
        () => {
          refetch();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", selectedSession.id)
        .order("sent_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        return [];
      }

      return (data || []) as Message[];
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

  // Realtime updates for the selected session (messages + calls)
  useEffect(() => {
    if (!selectedSession?.id) return;

    const channel = supabase
      .channel(`session-${selectedSession.id}-stream`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${selectedSession.id}`,
        },
        () => {
          refetchMessages();
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
        () => {
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
      setSelectedSession(null);
      setSelectedEmployeeId("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to assign session");
    },
  });

  const handleViewSession = (session: Session) => {
    setSelectedSession(session);
    navigate(`/sessions/${session.id}`);
  };

  const handleAssignAgent = (session: Session) => {
    setSelectedSession(session);
    setSelectedEmployeeId(session.employee_id || "");
    setAssignDialogOpen(true);
  };

  const handleAssignSubmit = () => {
    if (!selectedSession || !selectedEmployeeId) {
      toast.error("Please select an employee");
      return;
    }
    assignMutation.mutate({
      sessionId: selectedSession.id,
      employeeId: selectedEmployeeId,
    });
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedSession) return;

    // 1. Insert local message for immediate feedback
    const { error } = await supabase.from("messages").insert({
      session_id: selectedSession.id,
      direction: "outbound",
      content,
      channel: selectedSession.channel,
    });

    if (error) {
      toast.error("Failed to save message");
      return;
    }

    // 2. If it's a WhatsApp message, trigger the Edge Function to send it via API
    if (selectedSession.channel === "whatsapp") {
      try {
        const { error: funcError } = await supabase.functions.invoke(
          "whatsapp",
          {
            body: {
              action: "send_message",
              sessionId: selectedSession.id,
              content: content,
            },
          },
        );

        if (funcError) {
          console.error("WhatsApp delivery error:", funcError);
          toast.error("Message saved but failed to deliver to WhatsApp");
        }
      } catch (err) {
        console.error("Edge function call failed:", err);
      }
    }

    refetchMessages();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Active AI Sessions
          </h1>
          <p className="text-muted-foreground">
            Monitor and manage all currently active customer sessions.
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
                <SelectTrigger className="w-full sm:w-[180px]">
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
              <Button variant="outline" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sessions Table */}
        <SessionsTable
          sessions={sessions || []}
          loading={isLoading}
          onViewSession={handleViewSession}
          onAssignAgent={canAssign ? handleAssignAgent : undefined}
        />

        {/* Session Detail: Messages & Call timeline */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 h-[650px] flex flex-col">
            <CardContent className="p-0 flex-1 flex flex-col">
              <ChatView
                session={selectedSession}
                messages={sessionMessages || []}
                onSendMessage={handleSendMessage}
                loading={messagesLoading}
              />
            </CardContent>
          </Card>

          <Card className="h-[650px] flex flex-col">
            <CardContent className="p-4 flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Session Activity</h3>
                  <p className="text-sm text-muted-foreground">
                    Latest calls & status updates
                  </p>
                </div>
                {selectedSession && (
                  <Badge variant="outline" className="capitalize">
                    {selectedSession.status}
                  </Badge>
                )}
              </div>

              <div className="space-y-3 overflow-y-auto h-full pr-1">
                {callsLoading ? (
                  [...Array(4)].map((_, idx) => (
                    <div
                      key={idx}
                      className="h-16 rounded-lg bg-muted animate-pulse"
                    />
                  ))
                ) : sessionCalls && sessionCalls.length > 0 ? (
                  sessionCalls.map((call) => (
                    <div
                      key={call.id}
                      className="rounded-lg border border-border p-3 bg-muted/30 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">
                          {call.direction} call
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(call.started_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Status: {call.status}</span>
                        <span>
                          Duration:{" "}
                          {call.duration_seconds
                            ? `${call.duration_seconds}s`
                            : "-"}
                        </span>
                      </div>
                      {call.phone_number && (
                        <p className="text-xs text-muted-foreground">
                          Phone: {call.phone_number}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-10">
                    No call activity yet for this session.
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
              {selectedSession && (
                <div className="space-y-2">
                  <Label>Session</Label>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium">
                      {selectedSession.customer?.name || "Unknown Customer"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Channel: {selectedSession.channel} • Status:{" "}
                      {selectedSession.status}
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
                    <SelectItem value="">Unassign</SelectItem>
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
                    setSelectedSession(null);
                    setSelectedEmployeeId("");
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
