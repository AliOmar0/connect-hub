import { useState, useEffect } from 'react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import ConversationList from '@/components/messages/ConversationList';
import ChatView from '@/components/messages/ChatView';
import { supabase } from '@/integrations/supabase/client';
import { Session, Message, Customer } from '@/types/database';

export default function MessagesPage() {
  const [sessions, setSessions] = useState<(Session & { customer?: Customer })[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    fetchSessions();

    // Real-time subscription for sessions
    const sessionsChannel = supabase
      .channel("sessions-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
        },
        () => {
          fetchSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
    };
  }, []);

  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession);

      // Real-time subscription for messages in selected session
      const messagesChannel = supabase
        .channel(`messages-${selectedSession}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `session_id=eq.${selectedSession}`,
          },
          () => {
            fetchMessages(selectedSession);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [selectedSession]);

  const fetchSessions = async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*, customer:customers(*)')
      .order('started_at', { ascending: false });
    setSessions((data || []) as Session[]);
    setLoading(false);
  };

  const fetchMessages = async (sessionId: string) => {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('sent_at', { ascending: true });
    setMessages((data || []) as Message[]);
    setMessagesLoading(false);
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedSession) return;
    const session = sessions.find(s => s.id === selectedSession);
    const { error } = await supabase.from('messages').insert({
      session_id: selectedSession,
      direction: 'outbound',
      content,
      channel: session?.channel || 'whatsapp',
    });
    
    if (error) {
      console.error("Error sending message:", error);
      return;
    }
    
    // Message will be updated via real-time subscription
  };

  const currentSession = sessions.find(s => s.id === selectedSession) || null;

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-7rem)] -m-6">
        <div className="w-80 border-r border-border">
          <ConversationList
            sessions={sessions}
            selectedSession={selectedSession}
            onSelectSession={setSelectedSession}
            loading={loading}
          />
        </div>
        <ChatView
          session={currentSession}
          messages={messages}
          onSendMessage={handleSendMessage}
          loading={messagesLoading}
        />
      </div>
    </DashboardLayout>
  );
}