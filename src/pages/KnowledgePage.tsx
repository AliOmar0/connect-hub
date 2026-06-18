import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  RefreshCw,
  History,
  RotateCcw,
  FileText,
  AlertTriangle,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { KB_API_URL } from "@/lib/config";
import { cn } from "@/lib/utils";

interface KbDocument {
  id: string;
  name: string;
  status: "indexed" | "processing" | "failed";
  version: number;
  updated_at: string;
}

interface KbVersion {
  version: number;
  created_at: string;
  note?: string;
}

const statusStyles: Record<string, string> = {
  indexed: "bg-green-500/10 text-green-600 border-green-500/30",
  processing: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  failed: "bg-red-500/10 text-red-600 border-red-500/30",
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
  } = useQuery({
    queryKey: ["kb-documents"],
    queryFn: async (): Promise<KbDocument[]> => {
      const res = await fetch(`${KB_API_URL}/documents`);
      if (!res.ok) throw new Error("KB backend unavailable");
      return res.json();
    },
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${KB_API_URL}/documents`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success(t("kb.uploadSuccess"));
      queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
    },
    onError: () => toast.error(t("kb.backendMissing")),
  });

  const reindexMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${KB_API_URL}/documents/${id}/reindex`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Re-index failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success(t("kb.reindexSuccess"));
      queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
    },
    onError: () => toast.error(t("kb.backendMissing")),
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const res = await fetch(`${KB_API_URL}/documents/${id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) throw new Error("Rollback failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success(t("kb.rollbackSuccess"));
      setHistoryDoc(null);
      queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
    },
    onError: () => toast.error(t("kb.backendMissing")),
  });

  const onPickFile = () => fileInputRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("kb.title")}</h1>
            <p className="text-muted-foreground">{t("kb.subtitle")}</p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx,.json,.csv"
              className="hidden"
              onChange={onFileChange}
            />
            <Button
              onClick={onPickFile}
              disabled={uploadMutation.isPending}
              className="min-h-[44px]"
            >
              <Upload className="h-4 w-4 me-2" />
              {uploadMutation.isPending ? t("kb.uploading") : t("kb.upload")}
            </Button>
          </div>
        </div>

        {isError && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex items-center gap-2 py-4 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              {t("kb.backendMissing")}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("kb.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">{t("common.loading")}</p>
            ) : documents.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                {t("kb.empty")}
              </p>
            ) : (
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
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {doc.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(statusStyles[doc.status])}
                        >
                          {t(
                            `kb.status${doc.status.charAt(0).toUpperCase()}${doc.status.slice(1)}`,
                          )}
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
                            title={t("kb.reindex")}
                            onClick={() => reindexMutation.mutate(doc.id)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={t("kb.versionHistory")}
                            onClick={() => setHistoryDoc(doc)}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <VersionHistoryDialog
        doc={historyDoc}
        onClose={() => setHistoryDoc(null)}
        onRollback={(version) =>
          historyDoc && rollbackMutation.mutate({ id: historyDoc.id, version })
        }
      />
    </DashboardLayout>
  );
}

function VersionHistoryDialog({
  doc,
  onClose,
  onRollback,
}: {
  doc: KbDocument | null;
  onClose: () => void;
  onRollback: (version: number) => void;
}) {
  const { t } = useTranslation();

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ["kb-versions", doc?.id],
    enabled: !!doc,
    queryFn: async (): Promise<KbVersion[]> => {
      const res = await fetch(`${KB_API_URL}/documents/${doc!.id}/versions`);
      if (!res.ok) throw new Error("Versions unavailable");
      return res.json();
    },
    retry: false,
  });

  return (
    <Dialog open={!!doc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("kb.versionHistory")} — {doc?.name}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.version}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">v{v.version}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString()}
                    {v.note ? ` · ${v.note}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRollback(v.version)}
                >
                  <RotateCcw className="h-4 w-4 me-1" />
                  {t("kb.rollback")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
