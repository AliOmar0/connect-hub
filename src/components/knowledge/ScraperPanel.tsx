import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlayCircle, Loader2, History, FileSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { AsyncBoundary } from "@/components/ui/async-boundary";
import type { ViewStatus } from "@/types/presentation";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { SCRAPER_API_URL, apiFetch } from "@/lib/config";
import { requireOk } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// All /api/v1/scraper/* routes are protected by verify_jwt on the backend, so
// every call needs the current Supabase access token attached (same pattern
// as KnowledgePage.tsx's authHeaders()).
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

interface CrawlJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  trigger_type: "scheduled" | "manual";
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  pages_visited: number;
  pages_succeeded: number;
  pages_failed: number;
  failure_reason: string | null;
  created_at: string;
}

const jobStatusStyles: Record<CrawlJob["status"], string> = {
  pending: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  running: "border-primary/30 bg-primary/10 text-primary",
  completed:
    "border-status-success/30 bg-status-success/10 text-status-success",
  failed: "border-status-error/30 bg-status-error/10 text-status-error",
};

export default function ScraperPanel() {
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();

  // Only admin/supervisor may trigger a crawl (Requirements 9.1, 9.5). The
  // trigger button is omitted from the DOM entirely for every other role,
  // which satisfies "hidden and disabled" in the strongest possible sense.
  const canTrigger = userRole === "admin" || userRole === "supervisor";

  const { data: currentJob, isLoading: isCurrentJobLoading } = useQuery({
    queryKey: ["scraper-current-job"],
    queryFn: async (): Promise<CrawlJob | null> => {
      const res = await apiFetch(`${SCRAPER_API_URL}/jobs/current`, {
        headers: await authHeaders(),
      });
      await requireOk(res, "Scraper request failed");
      return res.json();
    },
    refetchInterval: 5000,
    retry: false,
  });

  const {
    data: jobs = [],
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["scraper-jobs"],
    queryFn: async (): Promise<CrawlJob[]> => {
      const res = await apiFetch(`${SCRAPER_API_URL}/jobs`, {
        headers: await authHeaders(),
      });
      await requireOk(res, "Scraper request failed");
      return res.json();
    },
    retry: false,
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${SCRAPER_API_URL}/jobs`, {
        method: "POST",
        headers: await authHeaders(),
      });
      if (res.status === 409) {
        throw new Error("already-running");
      }
      await requireOk(res, "Couldn't start the crawl job");
      return res.json();
    },
    onSuccess: () => {
      notifySuccess(t("scraper.triggerSuccess"));
      queryClient.invalidateQueries({ queryKey: ["scraper-current-job"] });
      queryClient.invalidateQueries({ queryKey: ["scraper-jobs"] });
    },
    onError: (error: Error) => {
      const message =
        error.message === "already-running"
          ? t("scraper.alreadyRunning")
          : t("scraper.triggerFailed");
      notifyError(message, {
        action:
          error.message === "already-running"
            ? undefined
            : {
                label: t("feedback.retry"),
                onClick: () => triggerMutation.mutate(),
              },
      });
    },
  });

  const historyStatus: ViewStatus = isHistoryLoading
    ? "loading"
    : isHistoryError
      ? "error"
      : jobs.length === 0
        ? "empty"
        : "loaded";

  const isJobRunning = !isCurrentJobLoading && currentJob?.status === "running";

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{t("scraper.title")}</CardTitle>
          <CardDescription>{t("scraper.subtitle")}</CardDescription>
        </div>
        {canTrigger && (
          <Button
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending || isJobRunning}
            aria-busy={triggerMutation.isPending}
            className="min-h-[44px] shrink-0"
          >
            {triggerMutation.isPending ? (
              <Loader2
                className="h-4 w-4 me-2 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <PlayCircle className="h-4 w-4 me-2" aria-hidden="true" />
            )}
            {triggerMutation.isPending
              ? t("scraper.triggering")
              : isJobRunning
                ? t("scraper.alreadyRunning")
                : t("scraper.triggerNow")}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {isJobRunning && currentJob && (
          <section
            aria-labelledby="scraper-current-job-title"
            className="rounded-lg border border-border bg-muted/30 p-4"
          >
            <h3
              id="scraper-current-job-title"
              className="mb-4 text-sm font-semibold text-foreground"
            >
              {t("scraper.currentJobTitle")}
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {currentJob.pages_visited}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("scraper.pagesVisited")}
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-status-success">
                  {currentJob.pages_succeeded}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("scraper.pagesSucceeded")}
                </p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-status-error">
                  {currentJob.pages_failed}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("scraper.pagesFailed")}
                </p>
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="scraper-history-title" className="space-y-3">
          <h3 id="scraper-history-title" className="text-sm font-semibold">
            {t("scraper.history")}
          </h3>
          <AsyncBoundary
            status={historyStatus}
            skeleton={<ScraperHistorySkeleton />}
            onRetry={() => refetchHistory?.()}
            emptyTitle={t("scraper.empty")}
            emptyDescription={t("scraper.emptyDescription")}
            emptyIcon={<FileSearch />}
            errorTitle={t("scraper.loadErrorTitle")}
            errorDescription={t("scraper.backendMissing")}
            retryLabel={t("feedback.retry")}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("scraper.startedAt")}</TableHead>
                  <TableHead>{t("scraper.completedAt")}</TableHead>
                  <TableHead>{t("scraper.pagesSucceeded")}</TableHead>
                  <TableHead>{t("scraper.pagesFailed")}</TableHead>
                  <TableHead>{t("scraper.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <History
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {job.started_at
                          ? new Date(job.started_at).toLocaleString()
                          : new Date(job.created_at).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.completed_at
                        ? new Date(job.completed_at).toLocaleString()
                        : t("scraper.notCompleted")}
                    </TableCell>
                    <TableCell>{job.pages_succeeded}</TableCell>
                    <TableCell>{job.pages_failed}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize",
                          jobStatusStyles[job.status],
                        )}
                      >
                        {t(`scraper.statuses.${job.status}`)}
                      </Badge>
                      {job.failure_reason && (
                        <p className="mt-1 max-w-64 text-xs text-status-error">
                          {job.failure_reason}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AsyncBoundary>
        </section>
      </CardContent>
    </Card>
  );
}

function ScraperHistorySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}
