import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const EscalationListener = () => {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel("escalation-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const newNotif = payload.new;
          // Only show toast if it's a broadcast or for this specific user
          if (!newNotif.user_id || newNotif.user_id === session.user.id) {
            console.log("New Escalation Notification:", newNotif);

            toast.error(`⚠️ ${newNotif.title || "New Escalation"}`, {
              description:
                newNotif.message || "A customer requires human assistance.",
              action: newNotif.action_url
                ? {
                    label: "View",
                    onClick: () => (window.location.href = newNotif.action_url),
                  }
                : undefined,
              duration: 8000,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  return null;
};

export default EscalationListener;
