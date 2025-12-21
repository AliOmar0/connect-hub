import DashboardLayout from "@/components/layout/DashboardLayout";

export default function SessionsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Active Sessions
          </h1>
          <p className="text-muted-foreground">
            Monitor and manage all currently active customer sessions.
          </p>
        </div>
        
        <div className="flex items-center justify-center h-96 border-2 border-dashed border-border rounded-xl">
          <p className="text-muted-foreground">Sessions interface coming soon...</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
