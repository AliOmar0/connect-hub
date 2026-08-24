import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Notification } from "@/types/database";

import { useQueryClient } from "@tanstack/react-query";

const EscalationListener = () => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel("escalation-notifications")
      .on<Notification>(
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

            // Invalidate notifications query to update header badge
            queryClient.invalidateQueries({
              queryKey: ["header-notifications"],
            });

            // No decorative emoji in notification copy (Requirement 2.4);
            // the toast already carries an error icon and colour.
            toast.error(newNotif.title || "New Escalation", {
              description:
                newNotif.message || "A customer requires human assistance.",
              action: newNotif.action_url
                ? {
                    label: "View",
                    onClick: () => navigate(newNotif.action_url),
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
  }, [session, queryClient, navigate]);

  return null;
};

export default EscalationListener;
