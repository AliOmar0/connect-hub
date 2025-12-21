import DashboardLayout from "@/components/layout/DashboardLayout";

export default function CallsPage() {
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
        
        <div className="flex items-center justify-center h-96 border-2 border-dashed border-border rounded-xl">
          <p className="text-muted-foreground">Calls interface coming soon...</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
