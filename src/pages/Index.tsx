import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import ConversationsChart from "@/components/dashboard/ConversationsChart";
import ChannelDistributionChart from "@/components/dashboard/ChannelDistributionChart";
import ActiveSessionsPanel from "@/components/dashboard/ActiveSessionsPanel";
import EmployeesTable from "@/components/dashboard/EmployeesTable";
import IntegrationStatus from "@/components/dashboard/IntegrationStatus";
import ResponseTimeChart from "@/components/dashboard/ResponseTimeChart";
import {
  MessageSquare,
  Phone,
  Users,
  Headphones,
  Clock,
  CheckCircle2,
} from "lucide-react";

export default function Index() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Welcome back! Here's an overview of your communication center.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatsCard
            title="Total Messages"
            value="2,847"
            icon={MessageSquare}
            trend={{ value: 12.5, isPositive: true }}
            subtitle="This month"
            variant="navy"
          />
          <StatsCard
            title="Total Calls"
            value="534"
            icon={Phone}
            trend={{ value: 8.2, isPositive: true }}
            subtitle="This month"
            variant="gold"
          />
          <StatsCard
            title="Active Sessions"
            value="5"
            icon={Headphones}
            subtitle="Right now"
            variant="success"
          />
          <StatsCard
            title="Active Agents"
            value="8"
            icon={Users}
            subtitle="Online"
            variant="default"
          />
          <StatsCard
            title="Avg. Response"
            value="2.4m"
            icon={Clock}
            trend={{ value: 5.1, isPositive: false }}
            subtitle="Today"
            variant="warning"
          />
          <StatsCard
            title="Resolution Rate"
            value="94%"
            icon={CheckCircle2}
            trend={{ value: 2.3, isPositive: true }}
            subtitle="This week"
            variant="success"
          />
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ConversationsChart />
          <ChannelDistributionChart />
        </div>

        {/* Active Sessions & Response Time */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ActiveSessionsPanel />
          </div>
          <ResponseTimeChart />
        </div>

        {/* Team & Integrations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <EmployeesTable />
          <IntegrationStatus />
        </div>
      </div>
    </DashboardLayout>
  );
}
