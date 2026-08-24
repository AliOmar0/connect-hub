import { useEffect, useState } from "react";
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
  Search,
  ArrowUpDown,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
// Mirrors _CHANNELS in app/api/v1/complaints.py.
const CHANNEL_FILTERS = [
  "all",
  "whatsapp",
  "messenger",
  "sms",
  "voice",
  "email",
] as const;
// Mirrors _SORTS. "severity" is worst-first within the page; "newest" is the
// ordering that holds across pages.
const SORTS = ["severity", "newest"] as const;

// Rows per request. Comfortably under the endpoint's 200-row cap, and small
// enough that a page is scannable rather than a wall.
const PAGE_SIZE = 50;

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
  { tone: StatusTone; Icon: LucideIcon; labelKey: string }
> = {
  new: { tone: "error", Icon: CircleDot, labelKey: "complaints.statusNew" },
  in_progress: {
    tone: "warning",
    Icon: Loader2,
    labelKey: "complaints.statusInProgress",
  },
  resolved: {
    tone: "success",
    Icon: CheckCircle2,
    labelKey: "complaints.statusResolved",
  },
  closed: {
    tone: "neutral",
    Icon: Archive,
    labelKey: "complaints.statusClosed",
  },
};

// Same rule as statusConfig: an icon and a label carry the meaning, so severity
// is never communicated by color alone.
const severityConfig: Record<
  ComplaintSeverity,
  { tone: StatusTone; Icon: LucideIcon; labelKey: string }
> = {
  critical: {
    tone: "error",
    Icon: ShieldAlert,
    labelKey: "complaints.severityCritical",
  },
  high: {
    tone: "error",
    Icon: AlertTriangle,
    labelKey: "complaints.severityHigh",
  },
  medium: {
    tone: "warning",
    Icon: Info,
    labelKey: "complaints.severityMedium",
  },
  low: { tone: "neutral", Icon: Minus, labelKey: "complaints.severityLow" },
};

function SeverityBadge({ severity }: { severity?: ComplaintSeverity }) {
  const { t } = useTranslation();
  // Rows predating the severity column, or an unrecognised value, must not
  // blank the cell.
  const config = severity ? severityConfig[severity] : undefined;
  if (!config) {
    return <Badge variant="outline">{severity ?? "—"}</Badge>;
  }
  return (
    <StatusBadge
      tone={config.tone}
      icon={config.Icon}
      label={t(config.labelKey)}
    />
  );
}

function ComplaintStatusBadge({ status }: { status: ComplaintStatus }) {
  const { t } = useTranslation();
  // An unrecognised status must not blank the cell: the backend's CHECK
  // constraint can gain a value before this map does.
  const config = statusConfig[status];
  if (!config) {
    return <Badge variant="outline">{status}</Badge>;
  }
  return (
    <StatusBadge
      tone={config.tone}
      icon={config.Icon}
      label={t(config.labelKey)}
    />
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
              <ComplaintStatusBadge status={complaint.status} />
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
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  // Same gate as the detail dialog: only roles the backend's
  // require_admin_access accepts get the row action.
  const canEditStatus = !!userRole && STATUS_EDIT_ROLES.includes(userRole);
  const [detailId, setDetailId] = useState<string | null>(
    routeComplaintId ?? null,
  );
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("all");
  const [severityFilter, setSeverityFilter] =
    useState<(typeof SEVERITY_FILTERS)[number]>("all");
  const [channelFilter, setChannelFilter] =
    useState<(typeof CHANNEL_FILTERS)[number]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("severity");
  // What the user has typed, and the value actually sent to the server. They
  // are separate so a search runs a beat after typing stops rather than firing
  // a request per keystroke.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // Any change to what is being asked for puts the reader back on page one:
  // staying on page 4 of a result set that now has two pages shows nothing.
  useEffect(() => {
    setPage(0);
  }, [statusFilter, severityFilter, channelFilter, search, sort]);

  const { data, isLoading, isError, refetch } = useQuery({
    // Filtering server-side, not in the browser: the endpoint caps the page at
    // 200 rows, so filtering after the fetch would silently hide matches that
    // fell outside that page. Everything that narrows or orders the result is
    // part of the key, so each combination is cached separately.
    queryKey: [
      "complaints",
      statusFilter,
      severityFilter,
      channelFilter,
      search,
      sort,
      page,
    ],
    queryFn: async (): Promise<{ rows: Complaint[]; total: number | null }> => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (search) params.set("search", search);
      params.set("sort", sort);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await apiFetch(
        `${BACKEND_URL}/api/v1/complaints?${params.toString()}`,
        { headers: await authHeaders() },
      );
      if (!res.ok) throw new Error("Complaints backend unavailable");

      // Absent when the count could not be taken, or when the response came
      // through a proxy that dropped it -- the pager then hides the total
      // rather than claiming zero.
      const header = res.headers.get("X-Total-Count");
      const parsed = header === null ? NaN : Number(header);
      return {
        rows: await res.json(),
        total: Number.isFinite(parsed) ? parsed : null,
      };
    },
    retry: false,
    // Keeps the previous page on screen while the next one loads, so paging
    // does not flash the table back through its skeleton.
    placeholderData: (previous) => previous,
  });

  // Row-level resolve. The only way to move a complaint on used to be opening
  // the detail dialog, so the most common action on the page took two steps
  // and a context switch.
  const resolveComplaint = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${BACKEND_URL}/api/v1/complaints/${id}`, {
        method: "PATCH",
        headers: {
          ...(await authHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "resolved" }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      return (await res.json()) as Complaint;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast.success(t("complaints.statusUpdated"));
    },
    onError: () => toast.error(t("complaints.statusUpdateFailed")),
  });

  const complaints = data?.rows ?? [];
  const total = data?.total ?? null;

  const isFiltered =
    statusFilter !== "all" ||
    severityFilter !== "all" ||
    channelFilter !== "all" ||
    search !== "";

  const firstRow = page * PAGE_SIZE + 1;
  const lastRow = page * PAGE_SIZE + complaints.length;
  // Without a total, "there is a next page" is inferred from having received a
  // full page -- the last page then costs one extra empty request.
  const hasNextPage =
    total === null ? complaints.length === PAGE_SIZE : lastRow < total;

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
        <PageHeader
          title={t("complaints.title")}
          description={t("complaints.subtitle")}
        />

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* A plain h2 rather than CardTitle: CardTitle is hard-coded to h3,
                which would skip a level after the page's h1 and fail the
                heading-order axe rule. Classes match CardTitle's. */}
            <h2 className="text-base font-semibold leading-none tracking-tight">
              {t("complaints.listTitle")}
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              {/* Text search. Without it, finding one reference number meant
                  reading the table -- and only the first 200 rows of it. */}
              <div className="relative">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  className="w-[260px] ps-9"
                  placeholder={t("complaints.searchPlaceholder")}
                  aria-label={t("complaints.searchLabel")}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>

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

              <Select
                value={channelFilter}
                onValueChange={(v) =>
                  setChannelFilter(v as (typeof CHANNEL_FILTERS)[number])
                }
              >
                <SelectTrigger
                  className="w-[170px]"
                  aria-label={t("complaints.filterChannel")}
                >
                  <SelectValue placeholder={t("complaints.filterChannel")} />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_FILTERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "all"
                        ? t("complaints.filterAllChannels")
                        : t(`sessions.channels.${value}`, {
                            defaultValue: value,
                          })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={sort}
                onValueChange={(v) => setSort(v as (typeof SORTS)[number])}
              >
                <SelectTrigger
                  className="w-[190px]"
                  aria-label={t("complaints.sortLabel")}
                >
                  <ArrowUpDown
                    className="me-2 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`complaints.sort.${value}`)}
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
                    {/* Severity and status sit next to each other. They were at
                        opposite ends of the row, so judging "how bad is this,
                        and is anyone on it?" meant crossing five columns. */}
                    <TableRow>
                      <TableHead>{t("complaints.severity")}</TableHead>
                      <TableHead>{t("complaints.status")}</TableHead>
                      <TableHead>{t("complaints.reference")}</TableHead>
                      <TableHead>{t("complaints.category")}</TableHead>
                      <TableHead>{t("complaints.customer")}</TableHead>
                      <TableHead>{t("complaints.channel")}</TableHead>
                      <TableHead>{t("complaints.created")}</TableHead>
                      {canEditStatus && (
                        <TableHead className="text-end">
                          {t("complaints.actions")}
                        </TableHead>
                      )}
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
                          <ComplaintStatusBadge status={complaint.status} />
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
                        {canEditStatus && (
                          <TableCell className="text-end">
                            {/* Always rendered, never hover-gated. Disabled
                                rather than hidden once resolved, so the column
                                does not gain and lose controls as you scan. */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-[44px]"
                              disabled={
                                resolveComplaint.isPending ||
                                complaint.status === "resolved" ||
                                complaint.status === "closed"
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                resolveComplaint.mutate(complaint.id);
                              }}
                            >
                              {t("complaints.resolve")}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* The endpoint's page cap used to truncate the table with no
                  sign that it had: row 201 simply did not exist. */}
              <nav
                className="flex flex-wrap items-center justify-between gap-3 pt-4"
                aria-label={t("complaints.pagination.label")}
              >
                <p
                  className="text-body-sm text-muted-foreground"
                  aria-live="polite"
                >
                  {total === null
                    ? t("complaints.pagination.range", {
                        first: firstRow,
                        last: lastRow,
                      })
                    : t("complaints.pagination.rangeOfTotal", {
                        first: firstRow,
                        last: lastRow,
                        total,
                      })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    {t("complaints.pagination.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    disabled={!hasNextPage}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("complaints.pagination.next")}
                  </Button>
                </div>
              </nav>
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
