import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  RefreshCw,
  History,
  RotateCcw,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import ScraperPanel from "@/components/knowledge/ScraperPanel";
import SessionTypesPanel from "@/components/knowledge/SessionTypesPanel";
import type { ViewStatus } from "@/types/presentation";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { useAsyncAction } from "@/hooks/use-async-action";
import { KB_API_URL, apiFetch } from "@/lib/config";
import { ApiResponseError, requireOk } from "@/lib/api-error";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// All /api/v1/kb/* routes are protected by verify_jwt on the backend, so every
// call needs the current Supabase access token attached.
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

interface KbDocument {
  id: string;
  name: string;
  status: "indexed" | "processing" | "failed";
  version: number;
  updated_at: string;
  // Present for scraper-sourced documents: a short Page_Description and a
  // link back to the originating bank web page (Requirement 9.6).
  description?: string | null;
  source?: "upload" | "scraper" | "session_type";
  source_url?: string | null;
}

interface KbVersion {
  version: number;
  created_at: string;
  note?: string;
}

// Every status pairs a design-token color with a non-color cue (icon + label)
// so meaning is never carried by color alone (Requirements 2.5, 3.5).
const statusConfig: Record<
  KbDocument["status"],
  { className: string; Icon: typeof CheckCircle2; labelKey: string }
> = {
  indexed: {
    className:
      "border-status-success/30 bg-status-success/10 text-status-success",
    Icon: CheckCircle2,
    labelKey: "kb.statusIndexed",
  },
  processing: {
    className:
      "border-status-warning/30 bg-status-warning/10 text-status-warning",
    Icon: Clock,
    labelKey: "kb.statusProcessing",
  },
  failed: {
    className: "border-status-error/30 bg-status-error/10 text-status-error",
    Icon: AlertTriangle,
    labelKey: "kb.statusFailed",
  },
};

export default function KnowledgePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [historyDoc, setHistoryDoc] = useState<KbDocument | null>(null);

  const {
    data: documents = [],
    isLoading,
    isError,
    error: documentsError,
    refetch,
  } = useQuery({
    queryKey: ["kb-documents"],
    queryFn: async (): Promise<KbDocument[]> => {
      const res = await apiFetch(`${KB_API_URL}/documents`, {
        headers: await authHeaders(),
      });
      await requireOk(res, "Knowledge-base request failed");
      return res.json();
    },
    retry: false,
  });

  const loadErrorDescription = (() => {
    if (!(documentsError instanceof ApiResponseError)) {
      return t("kb.backendMissing", { url: KB_API_URL });
    }
    if (documentsError.status === 401) return t("kb.errors.unauthorized");
    if (documentsError.status === 403) return t("kb.errors.forbidden");
    if (documentsError.status === 404) return t("kb.errors.notFound");
    if (documentsError.status >= 500) return t("kb.errors.server");
    return documentsError.detail || t("kb.errors.unknown");
  })();

  // Upload is wrapped in useAsyncAction so it presents a loading state, blocks
  // duplicate submission while in flight (Requirement 16.2 / 10.2), and exposes
  // a retry for the recovery action surfaced on failure (Requirement 16.3).
  const uploadAction = useAsyncAction<[File], unknown>(
    async (signal, file) => {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch(`${KB_API_URL}/documents`, {
        method: "POST",
        body: form,
        headers: await authHeaders(),
        signal,
      });
      await requireOk(res, "Upload failed");
      return res.json();
    },
    {
      onSuccess: () => {
        notifySuccess(t("kb.uploadSuccess"));
        queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
      },
      onError: (error) => {
        // Error_State with a recovery action; the collection stays presented.
        notifyError(t("kb.operationFailed"), {
          description:
            error instanceof ApiResponseError ? error.detail : undefined,
          action: {
            label: t("feedback.retry"),
            onClick: () => uploadAction.retry(),
          },
        });
      },
    },
  );

  const reindexMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${KB_API_URL}/documents/${id}/reindex`, {
        method: "POST",
        headers: await authHeaders(),
      });
      await requireOk(res, "Re-index failed");
      return res.json();
    },
    onSuccess: () => {
      notifySuccess(t("kb.reindexSuccess"));
      queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
    },
    onError: (_error, id) => {
      notifyError(t("kb.operationFailed"), {
        action: {
          label: t("feedback.retry"),
          onClick: () => reindexMutation.mutate(id),
        },
      });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const res = await apiFetch(`${KB_API_URL}/documents/${id}/rollback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({ version }),
      });
      await requireOk(res, "Rollback failed");
      return res.json();
    },
    onSuccess: () => {
      notifySuccess(t("kb.rollbackSuccess"));
      setHistoryDoc(null);
      queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
    },
    onError: (_error, variables) => {
      notifyError(t("kb.operationFailed"), {
        action: {
          label: t("feedback.retry"),
          onClick: () => rollbackMutation.mutate(variables),
        },
      });
    },
  });

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAction.run(file);
    e.target.value = "";
  };

  const isUploading = uploadAction.isLoading;

  // Derive the single ViewStatus that drives the shared feedback boundary so
  // the collection uses the same loading / empty / error presentation as every
  // other page (Requirement 10.8).
  const collectionStatus: ViewStatus = isLoading
    ? "loading"
    : isError
      ? "error"
      : documents.length === 0
        ? "empty"
        : "loaded";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("kb.title")}
          </h1>
          <p className="text-muted-foreground">{t("kb.subtitle")}</p>
        </header>

        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-lg">{t("kb.documents")}</CardTitle>
              <CardDescription>{t("kb.documentsDescription")}</CardDescription>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
              <input
                ref={fileInputRef}
                id="kb-file-input"
                type="file"
                accept=".pdf,.txt,.md,.json"
                className="hidden"
                aria-label={t("kb.upload")}
                onChange={onFileChange}
              />
              <Button
                onClick={onPickFile}
                disabled={isUploading}
                aria-busy={isUploading}
                className="min-h-[44px]"
              >
                {isUploading ? (
                  <Loader2
                    className="h-4 w-4 me-2 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Upload className="h-4 w-4 me-2" aria-hidden="true" />
                )}
                {isUploading ? t("kb.uploading") : t("kb.upload")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("kb.uploadHelp")}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <AsyncBoundary
              status={collectionStatus}
              skeleton={<DocumentTableSkeleton />}
              onRetry={() => refetch?.()}
              emptyTitle={t("kb.empty")}
              emptyDescription={t("kb.emptyDescription")}
              emptyIcon={<FileText />}
              emptyAction={
                <Button onClick={onPickFile} className="min-h-[44px]">
                  <Upload className="h-4 w-4 me-2" aria-hidden="true" />
                  {t("kb.upload")}
                </Button>
              }
              errorTitle={t("kb.loadErrorTitle")}
              errorDescription={loadErrorDescription}
              retryLabel={t("feedback.retry")}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("kb.name")}</TableHead>
                    <TableHead>{t("kb.status")}</TableHead>
                    <TableHead>{t("kb.version")}</TableHead>
                    <TableHead>{t("kb.updated")}</TableHead>
                    <TableHead className="text-end">
                      {t("kb.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const status = statusConfig[doc.status];
                    const StatusIcon = status.Icon;
                    const isScraped = doc.source === "scraper";
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-start gap-2">
                            <FileText
                              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="flex flex-col gap-0.5">
                              {doc.name}
                              {/* Page_Description + source link, shown only for
                                  scraper-sourced documents (Requirement 9.6). */}
                              {isScraped && doc.description && (
                                <span className="text-xs text-muted-foreground">
                                  {doc.description}
                                </span>
                              )}
                              {isScraped && doc.source_url && (
                                <a
                                  href={doc.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                >
                                  {doc.source_url}
                                </a>
                              )}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("gap-1", status.className)}
                          >
                            <StatusIcon
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            {t(status.labelKey)}
                          </Badge>
                        </TableCell>
                        <TableCell>v{doc.version}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(doc.updated_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="min-h-[44px] min-w-[44px]"
                              title={t("kb.reindex")}
                              aria-label={t("kb.reindex")}
                              aria-busy={
                                reindexMutation.isPending &&
                                reindexMutation.variables === doc.id
                              }
                              disabled={
                                reindexMutation.isPending &&
                                reindexMutation.variables === doc.id
                              }
                              onClick={() => reindexMutation.mutate(doc.id)}
                            >
                              <RefreshCw
                                className={cn(
                                  "h-4 w-4",
                                  reindexMutation.isPending &&
                                    reindexMutation.variables === doc.id &&
                                    "animate-spin",
                                )}
                                aria-hidden="true"
                              />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="min-h-[44px] min-w-[44px]"
                              title={t("kb.versionHistory")}
                              aria-label={t("kb.versionHistory")}
                              onClick={() => setHistoryDoc(doc)}
                            >
                              <History className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AsyncBoundary>
          </CardContent>
        </Card>

        <ScraperPanel />

        <SessionTypesPanel />
      </div>

      <VersionHistoryDialog
        doc={historyDoc}
        onClose={() => setHistoryDoc(null)}
        rollbackPending={rollbackMutation.isPending}
        rollbackVersion={rollbackMutation.variables?.version}
        onRollback={(version) =>
          historyDoc && rollbackMutation.mutate({ id: historyDoc.id, version })
        }
      />
    </DashboardLayout>
  );
}

function DocumentTableSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="ms-auto h-9 w-24" />
        </div>
      ))}
    </div>
  );
}

function VersionHistoryDialog({
  doc,
  onClose,
  onRollback,
  rollbackPending,
  rollbackVersion,
}: {
  doc: KbDocument | null;
  onClose: () => void;
  onRollback: (version: number) => void;
  rollbackPending: boolean;
  rollbackVersion?: number;
}) {
  const { t } = useTranslation();

  const {
    data: versions = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["kb-versions", doc?.id],
    enabled: !!doc,
    queryFn: async (): Promise<KbVersion[]> => {
      const res = await apiFetch(
        `${KB_API_URL}/documents/${doc!.id}/versions`,
        {
          headers: await authHeaders(),
        },
      );
      await requireOk(res, "Versions unavailable");
      return res.json();
    },
    retry: false,
  });

  const versionStatus: ViewStatus = isLoading
    ? "loading"
    : isError
      ? "error"
      : versions.length === 0
        ? "empty"
        : "loaded";

  return (
    <Dialog
      open={!!doc}
      onOpenChange={(open) => !open && !rollbackPending && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("kb.versionHistory")} — {doc?.name}
          </DialogTitle>
          <DialogDescription>
            {t("kb.versionHistoryDescription")}
          </DialogDescription>
        </DialogHeader>
        <AsyncBoundary
          status={versionStatus}
          skeleton={<DocumentTableSkeleton />}
          onRetry={() => refetch()}
          emptyTitle={t("kb.noVersions")}
          errorTitle={t("kb.versionHistoryError")}
          errorDescription={t("kb.errors.unknown")}
          retryLabel={t("feedback.retry")}
        >
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pe-1">
            {versions.map((v) => {
              const isRollingBack =
                rollbackPending && rollbackVersion === v.version;
              return (
                <div
                  key={v.version}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">v{v.version}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString()}
                      {v.note ? ` · ${v.note}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px] shrink-0"
                    disabled={rollbackPending}
                    aria-busy={isRollingBack}
                    onClick={() => onRollback(v.version)}
                  >
                    {isRollingBack ? (
                      <Loader2
                        className="h-4 w-4 me-1 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <RotateCcw className="h-4 w-4 me-1" aria-hidden="true" />
                    )}
                    {t("kb.rollback")}
                  </Button>
                </div>
              );
            })}
          </div>
        </AsyncBoundary>
      </DialogContent>
    </Dialog>
  );
}
