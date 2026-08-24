import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap, Plus, Trash2, Edit2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { ChatShortcut } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";
import type { ViewStatus } from "@/types/presentation";
import { toast } from "sonner";

export default function ShortcutsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<ChatShortcut | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatShortcut | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: shortcuts,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["chat-shortcuts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("chat_shortcuts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      // Rethrow rather than returning []. Swallowing the failure made the
      // error state structurally impossible: a backend outage rendered as
      // "No shortcuts yet" with a "create your first one" prompt.
      if (error) throw new Error(error.message);
      return data as ChatShortcut[];
    },
    enabled: !!user?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      titleVal,
      contentVal,
    }: {
      titleVal: string;
      contentVal: string;
    }) => {
      if (!user?.id)
        throw new Error(
          t("shortcutsPage.quickReplies.errors.notAuthenticated"),
        );
      if (!titleVal.trim() || !contentVal.trim())
        throw new Error(t("shortcutsPage.quickReplies.errors.required"));

      if (editingShortcut) {
        const { error } = await supabase
          .from("chat_shortcuts")
          .update({ title: titleVal.trim(), content: contentVal.trim() })
          .eq("id", editingShortcut.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chat_shortcuts").insert({
          user_id: user.id,
          title: titleVal.trim(),
          content: contentVal.trim(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-shortcuts"] });
      toast.success(
        editingShortcut
          ? t("shortcutsPage.quickReplies.toasts.updated")
          : t("shortcutsPage.quickReplies.toasts.added"),
      );
      setIsAddEditOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("chat_shortcuts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-shortcuts"] });
      toast.success(t("shortcutsPage.quickReplies.toasts.deleted"));
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setDeleteTarget(null);
    },
  });

  const resetForm = () => {
    setTitle("");
    setContent("");
    setEditingShortcut(null);
  };

  const handleOpenEdit = (shortcut: ChatShortcut) => {
    setEditingShortcut(shortcut);
    setTitle(shortcut.title);
    setContent(shortcut.content);
    setIsAddEditOpen(true);
  };

  const filteredShortcuts =
    shortcuts?.filter(
      (s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.content.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? [];

  const listStatus: ViewStatus = isError
    ? "error"
    : isLoading
      ? "loading"
      : filteredShortcuts.length === 0
        ? "empty"
        : "loaded";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          {/* The heading no longer carries an inline icon: PageHeader fixes one
              treatment for every page, and this was the only h1 in the app with
              one. The description is now translated -- and the decorative emoji
              it used to contain is gone (Requirement 2.4). */}
          <PageHeader
            title={t("shortcutsPage.quickReplies.title")}
            description={t("shortcutsPage.quickReplies.subtitle")}
          />
          <Button
            id="add-chat-shortcut-btn"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => {
              resetForm();
              setIsAddEditOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("shortcutsPage.quickReplies.add")}
          </Button>
        </div>

        {/* Search, with the count beside it so the list says how much of
            itself is showing once a search narrows it. */}
        {(shortcuts?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder={t("shortcutsPage.quickReplies.searchPlaceholder")}
              aria-label={t("shortcutsPage.quickReplies.searchLabel")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 max-w-xs text-sm"
              id="chat-shortcuts-search"
            />
            <span className="text-overline uppercase text-muted-foreground">
              {t("shortcutsPage.quickReplies.count", {
                count: filteredShortcuts.length,
              })}
            </span>
          </div>
        )}

        {/* Shortcuts grid. Loading / empty / error all run through the shared
            AsyncBoundary, so a backend outage reads as a failure with a retry
            rather than as an empty collection. */}
        <AsyncBoundary
          status={listStatus}
          skeleton={
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          }
          onRetry={() => refetch()}
          emptyIcon={<Zap />}
          emptyTitle={
            searchQuery
              ? t("shortcutsPage.quickReplies.noMatchTitle")
              : t("shortcutsPage.quickReplies.emptyTitle")
          }
          emptyDescription={
            searchQuery
              ? t("shortcutsPage.quickReplies.noMatchDescription")
              : t("shortcutsPage.quickReplies.emptyDescription")
          }
          emptyAction={
            searchQuery ? undefined : (
              <Button
                variant="outline"
                className="gap-2 min-h-[44px]"
                onClick={() => {
                  resetForm();
                  setIsAddEditOpen(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("shortcutsPage.quickReplies.emptyAction")}
              </Button>
            )
          }
          errorTitle={t("shortcutsPage.quickReplies.errorTitle")}
          errorDescription={t("shortcutsPage.quickReplies.errorDescription")}
          retryLabel={t("feedback.retry")}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredShortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                className="relative flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
              >
                {/* Always rendered, never hover-gated: the buttons used to be
                    `opacity-0` until the card was hovered, which left them
                    unreachable by touch and invisible to a keyboard user
                    tabbing through them. Logical inset so they mirror in RTL. */}
                <div className="absolute top-2 end-2 flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-muted-foreground hover:text-primary"
                    onClick={() => handleOpenEdit(shortcut)}
                    aria-label={t("shortcutsPage.quickReplies.editAction", {
                      title: shortcut.title,
                    })}
                    id={`edit-shortcut-${shortcut.id}`}
                  >
                    <Edit2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(shortcut)}
                    aria-label={t("shortcutsPage.quickReplies.deleteAction", {
                      title: shortcut.title,
                    })}
                    id={`delete-shortcut-${shortcut.id}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                <div className="flex items-start gap-2 pe-24">
                  <Zap
                    className="h-4 w-4 text-primary shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold leading-none truncate">
                    {shortcut.title}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap ps-6">
                  {shortcut.content}
                </p>
              </div>
            ))}
          </div>
        </AsyncBoundary>
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog
        open={isAddEditOpen}
        onOpenChange={(v) => {
          setIsAddEditOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {editingShortcut
                ? t("shortcutsPage.quickReplies.dialog.editTitle")
                : t("shortcutsPage.quickReplies.dialog.newTitle")}
            </DialogTitle>
            <DialogDescription>
              {editingShortcut
                ? t("shortcutsPage.quickReplies.dialog.editDescription")
                : t("shortcutsPage.quickReplies.dialog.newDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="page-shortcut-title">
                {t("shortcutsPage.quickReplies.dialog.titleLabel")}
              </Label>
              <Input
                id="page-shortcut-title"
                placeholder={t(
                  "shortcutsPage.quickReplies.dialog.titlePlaceholder",
                )}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
              <p className="text-caption text-muted-foreground">
                {t("shortcutsPage.quickReplies.dialog.titleHelp")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="page-shortcut-content">
                {t("shortcutsPage.quickReplies.dialog.contentLabel")}
              </Label>
              <Textarea
                id="page-shortcut-content"
                placeholder={t(
                  "shortcutsPage.quickReplies.dialog.contentPlaceholder",
                )}
                className="min-h-[120px] resize-none"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <p className="text-caption text-muted-foreground">
                {t("shortcutsPage.quickReplies.dialog.contentHelp")}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddEditOpen(false);
                resetForm();
              }}
              disabled={saveMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() =>
                saveMutation.mutate({ titleVal: title, contentVal: content })
              }
              disabled={
                saveMutation.isPending || !title.trim() || !content.trim()
              }
              className="min-w-[110px]"
            >
              {saveMutation.isPending
                ? t("shortcutsPage.quickReplies.dialog.saving")
                : editingShortcut
                  ? t("shortcutsPage.quickReplies.dialog.saveChanges")
                  : t("shortcutsPage.quickReplies.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("shortcutsPage.quickReplies.delete.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("shortcutsPage.quickReplies.delete.description", {
                title: deleteTarget?.title ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending
                ? t("shortcutsPage.quickReplies.delete.deleting")
                : t("shortcutsPage.quickReplies.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
