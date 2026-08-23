import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquareWarning,
  CircleDot,
  Loader2,
  CheckCircle2,
  Archive,
  ShieldAlert,
  AlertTriangle,
  Info,
  Minus,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { BidiText } from "@/components/ui/bidi-text";
import type { ViewStatus } from "@/types/presentation";
import { BACKEND_URL, apiFetch } from "@/lib/config";
import { supabase } from "@/integrations/supabase/client";
import { maskText } from "@/lib/mask";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// /api/v1/complaints is mounted behind verify_jwt, so every call carries the
// current Supabase access token. Same helper shape as QueuePage/KnowledgePage.
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

type ComplaintStatus = "new" | "in_progress" | "resolved" | "closed";
type ComplaintSeverity = "critical" | "high" | "medium" | "low";

// Mirrors _COMPLAINT_SEVERITIES in app/crud/crud.py. "all" is a UI-only value:
// Radix Select cannot hold an empty-string item value.
const SEVERITY_FILTERS = ["all", "critical", "high", "medium", "low"] as const;
const STATUS_FILTERS = [
  "all",
  "new",
  "in_progress",
  "resolved",
  "closed",
] as const;

// The same four values without the UI-only "all": what a staff member may move
// a complaint TO. Mirrors _STATUSES in app/api/v1/complaints.py, which rejects
// anything else with a 400.
const EDITABLE_STATUSES: readonly ComplaintStatus[] = [
  "new",
  "in_progress",
  "resolved",
  "closed",
];

// Who may change a complaint's status. Matches require_admin_access
// (ADMIN_ROLES in app/api/v1/deps.py) -- anyone else sees the badge only.
const STATUS_EDIT_ROLES = ["admin", "supervisor", "manager"];

interface Complaint {
  id: string;
  reference_number: string;
  session_id: string | null;
  customer_id: string | null;
  channel: string;
  customer_name: string | null;
  customer_phone: string | null;
  national_id_masked: string | null;
  category: string;
  description: string;
  related_account_masked: string | null;
  preferred_contact: string | null;
  language: string;
  status: ComplaintStatus;
  // Added by migration 20260822000000. Optional so a row written before it
  // (or a backend not yet redeployed) renders instead of blanking the table.
  severity?: ComplaintSeverity;
  location?: string | null;
  atm_identifier?: string | null;
  incident_at_text?: string | null;
  ai_summary?: string | null;
  intent?: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Every status pairs a design-token color with a non-color cue (icon + label),
// so meaning is never carried by color alone.
const statusConfig: Record<
  ComplaintStatus,
  { className: string; Icon: typeof CircleDot; labelKey: string }
> = {
  new: {
    className: "border-status-error/30 bg-status-error/10 text-status-error",
    Icon: CircleDot,
    labelKey: "complaints.statusNew",
  },
  in_progress: {
    className:
      "border-status-warning/30 bg-status-warning/10 text-status-warning",
    Icon: Loader2,
    labelKey: "complaints.statusInProgress",
  },
  resolved: {
    className:
      "border-status-success/30 bg-status-success/10 text-status-success",
    Icon: CheckCircle2,
    labelKey: "complaints.statusResolved",
  },
  closed: {
    className: "border-border bg-muted text-muted-foreground",
    Icon: Archive,
    labelKey: "complaints.statusClosed",
  },
};

// Same rule as statusConfig: an icon and a label carry the meaning, so severity
// is never communicated by color alone.
const severityConfig: Record<
  ComplaintSeverity,
  { className: string; Icon: typeof CircleDot; labelKey: string }
> = {
  critical: {
    className: "border-status-error/40 bg-status-error/15 text-status-error",
    Icon: ShieldAlert,
    labelKey: "complaints.severityCritical",
  },
  high: {
    className: "border-status-error/30 bg-status-error/10 text-status-error",
    Icon: AlertTriangle,
    labelKey: "complaints.severityHigh",
  },
  medium: {
    className:
      "border-status-warning/30 bg-status-warning/10 text-status-warning",
    Icon: Info,
    labelKey: "complaints.severityMedium",
  },
  low: {
    className: "border-border bg-muted text-muted-foreground",
    Icon: Minus,
    labelKey: "complaints.severityLow",
  },
};

function SeverityBadge({ severity }: { severity?: ComplaintSeverity }) {
  const { t } = useTranslation();
  // Rows predating the severity column, or an unrecognised value, must not
  // blank the cell.
  const config = severity ? severityConfig[severity] : undefined;
  if (!config) {
    return <Badge variant="outline">{severity ?? "—"}</Badge>;
  }
  const { className, Icon, labelKey } = config;
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t(labelKey)}
    </Badge>
  );
}

function StatusBadge({ status }: { status: ComplaintStatus }) {
  const { t } = useTranslation();
  // An unrecognised status must not blank the cell: the backend's CHECK
  // constraint can gain a value before this map does.
  const config = statusConfig[status];
  if (!config) {
    return <Badge variant="outline">{status}</Badge>;
  }
  const { className, Icon, labelKey } = config;
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t(labelKey)}
    </Badge>
  );
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ComplaintTableSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function ComplaintDetailDialog({
  complaintId,
  onClose,
}: {
  complaintId: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const canEditStatus = !!userRole && STATUS_EDIT_ROLES.includes(userRole);

  const { data: complaint, isLoading } = useQuery({
    queryKey: ["complaint-detail", complaintId],
    enabled: !!complaintId,
    queryFn: async (): Promise<Complaint> => {
      const res = await apiFetch(
        `${BACKEND_URL}/api/v1/complaints/${complaintId}`,
        { headers: await authHeaders() },
      );
      if (!res.ok) throw new Error("Complaint not found");
      return res.json();
    },
    retry: false,
  });

  // Goes through FastAPI, not supabase-js: the RLS UPDATE policy on
  // `complaints` covers admin/supervisor only, and managers work the queue too.
  const updateStatus = useMutation({
    mutationFn: async (status: ComplaintStatus) => {
      const res = await apiFetch(
        `${BACKEND_URL}/api/v1/complaints/${complaintId}`,
        {
          method: "PATCH",
          headers: {
            ...(await authHeaders()),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      return (await res.json()) as Complaint;
    },
    onSuccess: (updated) => {
      // The detail pane and the list behind it both hold this row.
      queryClient.setQueryData(["complaint-detail", complaintId], updated);
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast.success(t("complaints.statusUpdated"));
    },
    onError: () => toast.error(t("complaints.statusUpdateFailed")),
  });

  const rows: Array<{ label: string; value: React.ReactNode }> = complaint
    ? [
        {
          label: t("complaints.reference"),
          value: (
            <BidiText
              value={complaint.reference_number}
              className="font-mono"
            />
          ),
        },
        {
          label: t("complaints.category"),
          value: t(`complaints.categories.${complaint.category}`, {
            defaultValue: complaint.category,
          }),
        },
        {
          label: t("complaints.severity"),
          value: <SeverityBadge severity={complaint.severity} />,
        },
        { label: t("complaints.channel"), value: complaint.channel },
        { label: t("complaints.location"), value: complaint.location || "—" },
        {
          label: t("complaints.atmIdentifier"),
          value: complaint.atm_identifier || "—",
        },
        {
          label: t("complaints.incidentAt"),
          value: complaint.incident_at_text || "—",
        },
        {
          label: t("complaints.customer"),
          value: complaint.customer_name || "—",
        },
        {
          label: t("complaints.phone"),
          value: <BidiText value={maskText(complaint.customer_phone) || "—"} />,
        },
        {
          label: t("complaints.nationalId"),
          value: <BidiText value={complaint.national_id_masked || "—"} />,
        },
        {
          label: t("complaints.relatedAccount"),
          value: <BidiText value={complaint.related_account_masked || "—"} />,
        },
        {
          label: t("complaints.preferredContact"),
          value: complaint.preferred_contact || "—",
        },
        {
          label: t("complaints.created"),
          value: formatDate(complaint.created_at, i18n.language),
        },
      ]
    : [];

  return (
    <Dialog open={!!complaintId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("complaints.detailTitle")}</DialogTitle>
          <DialogDescription>
            {t("complaints.detailDescription")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : complaint ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={complaint.status} />
              <SeverityBadge severity={complaint.severity} />
            </div>

            {canEditStatus ? (
              <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 p-3">
                <div className="min-w-[12rem] flex-1">
                  <label
                    className="text-xs text-muted-foreground"
                    htmlFor="complaint-status"
                  >
                    {t("complaints.changeStatus")}
                  </label>
                  <Select
                    value={complaint.status}
                    disabled={updateStatus.isPending}
                    onValueChange={(v) =>
                      updateStatus.mutate(v as ComplaintStatus)
                    }
                  >
                    <SelectTrigger id="complaint-status" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EDITABLE_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(statusConfig[value].labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* The transition staff make most often, one click instead of
                    two. Hidden once it would be a no-op. */}
                {complaint.status !== "resolved" ? (
                  <Button
                    onClick={() => updateStatus.mutate("resolved")}
                    disabled={updateStatus.isPending}
                  >
                    {updateStatus.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {t("complaints.markResolved")}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {rows.map((row) => (
                <div key={row.label}>
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>

            {complaint.ai_summary ? (
              <div>
                <h3 className="text-xs text-muted-foreground">
                  {t("complaints.aiSummary")}
                </h3>
                <p className="mt-1 text-sm text-foreground">
                  {complaint.ai_summary}
                </p>
              </div>
            ) : null}

            <div>
              <h3 className="text-xs text-muted-foreground">
                {t("complaints.description")}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {complaint.description}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("complaints.notFound")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ComplaintsPage() {
  const { t, i18n } = useTranslation();
  // /complaints/:complaintId is where complaint notifications point. Opening
  // that URL must open the detail dialog directly, so the route param seeds the
  // state rather than living alongside it.
  const { complaintId: routeComplaintId } = useParams<{
    complaintId: string;
  }>();
  const navigate = useNavigate();
  const [detailId, setDetailId] = useState<string | null>(
    routeComplaintId ?? null,
  );
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("all");
  const [severityFilter, setSeverityFilter] =
    useState<(typeof SEVERITY_FILTERS)[number]>("all");

  const {
    data: complaints = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    // Filtering server-side, not in the browser: the endpoint already caps the
    // page at 200 rows, so filtering after the fetch would silently hide
    // matches that fell outside that page. The filters are part of the key so
    // each combination is cached separately.
    queryKey: ["complaints", statusFilter, severityFilter],
    queryFn: async (): Promise<Complaint[]> => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      const qs = params.toString();
      const res = await apiFetch(
        `${BACKEND_URL}/api/v1/complaints${qs ? `?${qs}` : ""}`,
        { headers: await authHeaders() },
      );
      if (!res.ok) throw new Error("Complaints backend unavailable");
      return res.json();
    },
    retry: false,
  });

  const isFiltered = statusFilter !== "all" || severityFilter !== "all";

  const status: ViewStatus = isLoading
    ? "loading"
    : isError
      ? "error"
      : complaints.length === 0
        ? "empty"
        : "loaded";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("complaints.title")}
          </h1>
          <p className="text-muted-foreground">{t("complaints.subtitle")}</p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* A plain h2 rather than CardTitle: CardTitle is hard-coded to h3,
                which would skip a level after the page's h1 and fail the
                heading-order axe rule. Classes match CardTitle's. */}
            <h2 className="text-base font-semibold leading-none tracking-tight">
              {t("complaints.listTitle")}
            </h2>

            <div className="flex flex-wrap gap-2">
              <Select
                value={severityFilter}
                onValueChange={(v) =>
                  setSeverityFilter(v as (typeof SEVERITY_FILTERS)[number])
                }
              >
                <SelectTrigger
                  className="w-[170px]"
                  aria-label={t("complaints.filterSeverity")}
                >
                  <SelectValue placeholder={t("complaints.filterSeverity")} />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_FILTERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "all"
                        ? t("complaints.filterAllSeverities")
                        : t(
                            `complaints.severity${value.charAt(0).toUpperCase()}${value.slice(1)}`,
                          )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as (typeof STATUS_FILTERS)[number])
                }
              >
                <SelectTrigger
                  className="w-[170px]"
                  aria-label={t("complaints.filterStatus")}
                >
                  <SelectValue placeholder={t("complaints.filterStatus")} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "all"
                        ? t("complaints.filterAllStatuses")
                        : t(statusConfig[value as ComplaintStatus].labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              status={status}
              skeleton={<ComplaintTableSkeleton />}
              onRetry={() => refetch?.()}
              emptyTitle={
                isFiltered
                  ? t("complaints.emptyFiltered")
                  : t("complaints.empty")
              }
              emptyDescription={
                isFiltered
                  ? t("complaints.emptyFilteredDescription")
                  : t("complaints.emptyDescription")
              }
              emptyIcon={<MessageSquareWarning />}
              errorTitle={t("complaints.loadErrorTitle")}
              errorDescription={t("complaints.backendMissing")}
              retryLabel={t("feedback.retry")}
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("complaints.severity")}</TableHead>
                      <TableHead>{t("complaints.reference")}</TableHead>
                      <TableHead>{t("complaints.category")}</TableHead>
                      <TableHead>{t("complaints.customer")}</TableHead>
                      <TableHead>{t("complaints.channel")}</TableHead>
                      <TableHead>{t("complaints.created")}</TableHead>
                      <TableHead className="text-end">
                        {t("complaints.status")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {complaints.map((complaint) => (
                      <TableRow
                        key={complaint.id}
                        className="cursor-pointer"
                        onClick={() => setDetailId(complaint.id)}
                      >
                        <TableCell>
                          <SeverityBadge severity={complaint.severity} />
                        </TableCell>
                        <TableCell>
                          <BidiText
                            value={complaint.reference_number}
                            className="font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          {t(`complaints.categories.${complaint.category}`, {
                            defaultValue: complaint.category,
                          })}
                        </TableCell>
                        <TableCell>
                          {complaint.customer_name || (
                            <BidiText
                              value={maskText(complaint.customer_phone) || "—"}
                            />
                          )}
                        </TableCell>
                        <TableCell>{complaint.channel}</TableCell>
                        <TableCell>
                          {formatDate(complaint.created_at, i18n.language)}
                        </TableCell>
                        <TableCell className="text-end">
                          <StatusBadge status={complaint.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </AsyncBoundary>
          </CardContent>
        </Card>
      </div>

      <ComplaintDetailDialog
        complaintId={detailId}
        onClose={() => {
          setDetailId(null);
          // Arrived via the deep link: drop the id from the URL too, so closing
          // the dialog does not leave an address that reopens it on refresh.
          if (routeComplaintId) navigate("/complaints", { replace: true });
        }}
      />
    </DashboardLayout>
  );
}
