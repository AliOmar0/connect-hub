import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, ExternalLink, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Integration {
  id: string;
  name: string;
  description: string;
  status: "connected" | "pending" | "error";
  icon: string;
  lastSync?: string;
}

const integrations: Integration[] = [
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    description: "Meta Business API integration",
    status: "connected",
    icon: "https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg",
    lastSync: "2 min ago",
  },
  {
    id: "messenger",
    name: "Facebook Messenger",
    description: "Meta Messenger API",
    status: "connected",
    icon: "https://upload.wikimedia.org/wikipedia/commons/b/be/Facebook_Messenger_logo_2020.svg",
    lastSync: "5 min ago",
  },
  {
    id: "instagram",
    name: "Instagram Direct",
    description: "Instagram messaging API",
    status: "pending",
    icon: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png",
  },
  {
    id: "sms",
    name: "SMS Gateway",
    description: "Twilio SMS integration",
    status: "error",
    icon: "📱",
  },
];

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

export default function IntegrationStatus() {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg font-semibold">
            Integrations
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {integrations.map((integration, index) => {
          const StatusIcon = statusConfig[integration.status].icon;
          
          return (
            <div
              key={integration.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/20 hover:bg-secondary/30 transition-all group fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center overflow-hidden">
                {integration.icon.startsWith("http") ? (
                  <img
                    src={integration.icon}
                    alt={integration.name}
                    className="w-6 h-6 object-contain"
                  />
                ) : (
                  <span className="text-xl">{integration.icon}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{integration.name}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {integration.description}
                </p>
              </div>

              {/* Status */}
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-medium gap-1",
                    statusConfig[integration.status].className
                  )}
                >
                  <StatusIcon className="h-3 w-3" />
                  {statusConfig[integration.status].label}
                </Badge>
                {integration.lastSync && (
                  <span className="text-[10px] text-muted-foreground">
                    Synced {integration.lastSync}
                  </span>
                )}
              </div>

              {/* Configure Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
