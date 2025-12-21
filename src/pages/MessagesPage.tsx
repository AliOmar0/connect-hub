import DashboardLayout from "@/components/layout/DashboardLayout";

export default function MessagesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Messages
          </h1>
          <p className="text-muted-foreground">
            Manage all incoming messages from WhatsApp, Messenger, and other channels.
          </p>
        </div>
        
        <div className="flex items-center justify-center h-96 border-2 border-dashed border-border rounded-xl">
          <p className="text-muted-foreground">Messages interface coming soon...</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
