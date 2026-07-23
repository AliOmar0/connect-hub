import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, ExternalLink, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tables } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

type ApiConfig = Tables<"api_configurations">;

interface IntegrationStatusProps {
  integrations?: ApiConfig[];
}

const channelNames: Record<string, { name: string; description: string }> = {
  whatsapp: {
    name: "WhatsApp Business",
    description: "Meta Business API integration",
  },
  messenger: { name: "Facebook Messenger", description: "Meta Messenger API" },
  sms: { name: "SMS Gateway", description: "SMS integration" },
  voice: { name: "Voice Calls", description: "Voice call integration" },
  email: { name: "Email", description: "Email integration" },
};

const statusConfig = {
  connected: {
    label: "Connected",
    icon: Check,
    className: "bg-chart-success/10 text-chart-success border-chart-success/30",
  },
  pending: {
    label: "Setup Pending",
    icon: AlertCircle,
    className: "bg-chart-warning/10 text-chart-warning border-chart-warning/30",
  },
  error: {
    label: "Error",
    icon: AlertCircle,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

export default function IntegrationStatus({
  integrations = [],
}: IntegrationStatusProps) {
  const navigate = useNavigate();

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg font-semibold">
            Integrations
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate("/settings")}
            aria-label="Manage integrations"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {integrations.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">No integrations configured</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure a channel in settings to see its status here.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => navigate("/settings")}
            >
              Open Settings
            </Button>
          </div>
        ) : (
          integrations.map((integration, index) => {
            const channelInfo = channelNames[integration.channel] || {
              name: integration.channel,
              description: `${integration.channel} integration`,
            };
            const status = integration.is_active ? "connected" : "pending";
            const StatusIcon = statusConfig[status].icon;
            const lastSync = integration.last_verified_at
              ? formatDistanceToNow(new Date(integration.last_verified_at), {
                  addSuffix: true,
                })
              : undefined;

            return (
              <div
                key={integration.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/20 hover:bg-secondary/30 transition-all group fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                  <span className="text-xl" aria-hidden="true">
                    {integration.channel === "whatsapp"
                      ? "🟢"
                      : integration.channel === "messenger"
                        ? "🔵"
                        : integration.channel === "voice"
                          ? "📞"
                          : integration.channel === "sms"
                            ? "💬"
                            : "📧"}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {channelInfo.name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {channelInfo.description}
                  </p>
                </div>

                {/* Status */}
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-medium gap-1",
                      statusConfig[status].className,
                    )}
                  >
                    <StatusIcon className="h-3 w-3" aria-hidden="true" />
                    {statusConfig[status].label}
                  </Badge>
                  {lastSync && (
                    <span className="text-[10px] text-muted-foreground">
                      Synced {lastSync}
                    </span>
                  )}
                </div>

                {/* Configure Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  onClick={() => navigate("/settings")}
                  aria-label={`Configure ${channelInfo.name}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
