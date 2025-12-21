import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import CallsTable from "@/components/calls/CallsTable";
import { supabase } from "@/integrations/supabase/client";
import { Call, Customer, Employee } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Filter, Download } from "lucide-react";
import { format, subDays } from "date-fns";

export default function CallsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<number>(7); // days

  const { data: calls, isLoading, refetch } = useQuery({
    queryKey: ["calls", statusFilter, directionFilter, dateRange, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("calls")
        .select("*, customer:customers(*), employee:employees(*, profile:profiles(*))")
        .order("started_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (directionFilter !== "all") {
        query = query.eq("direction", directionFilter);
      }

      const dateThreshold = subDays(new Date(), dateRange);
      query = query.gte("started_at", dateThreshold.toISOString());

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching calls:", error);
        return [];
      }

      // Client-side search filtering
      let filtered = (data as any) || [];
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (call: any) =>
            call.customer?.name?.toLowerCase().includes(term) ||
            call.phone_number?.toLowerCase().includes(term) ||
            call.employee?.profile?.first_name?.toLowerCase().includes(term) ||
            call.employee?.profile?.last_name?.toLowerCase().includes(term)
        );
      }

      return filtered as Array<Call & { customer?: Customer; employee?: Employee & { profile?: any } }>;
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("calls-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Calls
          </h1>
          <p className="text-muted-foreground">
            View and manage all phone calls and VoIP sessions.
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer, phone, or agent..."
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
                  <SelectItem value="initiated">Initiated</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
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

        {/* Calls Table */}
        <CallsTable calls={calls || []} loading={isLoading} />
      </div>
    </DashboardLayout>
  );
}
