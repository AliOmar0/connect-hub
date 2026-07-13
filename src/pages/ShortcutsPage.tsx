import { useState } from "react";
import { Zap, Plus, Trash2, Edit2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Keyboard shortcut catalog (exported for catalog tests) ───────────────────
// These are NOT rendered on this page anymore; kept as exports so existing
// catalog unit-tests (ShortcutsPage.catalog.test.ts) continue to pass.

export interface ShortcutDef {
  id: string;
  group: string;
  descriptionKey: string;
  availability: "available" | "planned";
  keys?: string | { mac: string; other: string };
}

// eslint-disable-next-line react-refresh/only-export-components
export const SHORTCUT_DEFS: ShortcutDef[] = [
  // General
  {
    id: "focus-next",
    group: "general",
    descriptionKey: "shortcutsPage.items.focusNext",
    availability: "available",
    keys: "Tab",
  },
  {
    id: "focus-previous",
    group: "general",
    descriptionKey: "shortcutsPage.items.focusPrevious",
    availability: "available",
    keys: "Shift + Tab",
  },
  {
    id: "activate",
    group: "general",
    descriptionKey: "shortcutsPage.items.activate",
    availability: "available",
    keys: "Enter",
  },
  {
    id: "dismiss",
    group: "general",
    descriptionKey: "shortcutsPage.items.dismiss",
    availability: "available",
    keys: "Esc",
  },
  // Navigation
  {
    id: "toggle-sidebar",
    group: "navigation",
    descriptionKey: "shortcutsPage.items.toggleSidebar",
    availability: "available",
    keys: { mac: "⌘ B", other: "Ctrl + B" },
  },
  // Chat - available
  {
    id: "chat-send-message",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatSendMessage",
    availability: "available",
    keys: "Enter",
  },
  {
    id: "chat-open-quick-replies",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatOpenQuickReplies",
    availability: "available",
    keys: "\\",
  },
  {
    id: "chat-picker-navigate",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatPickerNavigate",
    availability: "available",
    keys: "↑ / ↓",
  },
  {
    id: "chat-picker-insert",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatPickerInsert",
    availability: "available",
    keys: "Enter",
  },
  {
    id: "chat-picker-close",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatPickerClose",
    availability: "available",
    keys: "Esc",
  },
  // Chat - planned
  {
    id: "chat-reply-to-message",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatReplyToMessage",
    availability: "planned",
  },
  {
    id: "chat-resolve-conversation",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatResolveConversation",
    availability: "planned",
  },
  {
    id: "chat-switch-conversation",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatSwitchConversation",
    availability: "planned",
  },
  {
    id: "chat-quick-reply-navigate",
    group: "chat",
    descriptionKey: "shortcutsPage.items.chatQuickReplyNavigate",
    availability: "planned",
  },
];

import DashboardLayout from "@/components/layout/DashboardLayout";
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
import { supabase } from "@/integrations/supabase/client";
import { ChatShortcut } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function ShortcutsPage() {
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

  const { data: shortcuts, isLoading } = useQuery({
    queryKey: ["chat-shortcuts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("chat_shortcuts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) return [];
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
      if (!user?.id) throw new Error("Not authenticated");
      if (!titleVal.trim() || !contentVal.trim())
        throw new Error("Title and content are required");

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
        editingShortcut ? "Shortcut updated" : "Shortcut added successfully",
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
      toast.success("Shortcut deleted");
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Zap className="h-6 w-6 text-primary" aria-hidden="true" />
              Quick Reply Shortcuts
            </h1>
            <p className="text-muted-foreground mt-1">
              Personal shortcuts you can insert into chat messages. Type{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono border border-border">
                \
              </kbd>{" "}
              in the message box or click the ⚡ button to use them.
            </p>
          </div>
          <Button
            id="add-chat-shortcut-btn"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => {
              resetForm();
              setIsAddEditOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Shortcut
          </Button>
        </div>

        {/* Search */}
        {(shortcuts?.length ?? 0) > 0 && (
          <Input
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs h-9 text-sm"
            id="chat-shortcuts-search"
          />
        )}

        {/* Shortcuts grid */}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-lg bg-muted/50 animate-pulse"
              />
            ))}
          </div>
        ) : filteredShortcuts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
            <Zap className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">
              {searchQuery
                ? "No shortcuts match your search."
                : "No shortcuts yet."}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
              {!searchQuery &&
                "Create shortcuts to speed up your responses in chat sessions."}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  resetForm();
                  setIsAddEditOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add your first shortcut
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredShortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                className="group relative flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
              >
                {/* Hover action buttons */}
                <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => handleOpenEdit(shortcut)}
                    title="Edit shortcut"
                    id={`edit-shortcut-${shortcut.id}`}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(shortcut)}
                    title="Delete shortcut"
                    id={`delete-shortcut-${shortcut.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex items-start gap-2 pr-16">
                  <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold leading-none truncate">
                    {shortcut.title}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap pl-6">
                  {shortcut.content}
                </p>
              </div>
            ))}
          </div>
        )}
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
              {editingShortcut ? "Edit Shortcut" : "New Chat Shortcut"}
            </DialogTitle>
            <DialogDescription>
              {editingShortcut
                ? "Update the title or response text for this shortcut."
                : "Create a shortcut to quickly insert common responses into your messages."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="page-shortcut-title">Shortcut Title</Label>
              <Input
                id="page-shortcut-title"
                placeholder="e.g. Greeting, Farewell, Refund Info"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Used to search and identify this shortcut.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="page-shortcut-content">Response Content</Label>
              <Textarea
                id="page-shortcut-content"
                placeholder="Type the message to be inserted into the chat..."
                className="min-h-[120px] resize-none"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                This text will be inserted into the chat input when you select
                this shortcut.
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
              Cancel
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
                ? "Saving..."
                : editingShortcut
                  ? "Save Changes"
                  : "Add Shortcut"}
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
            <AlertDialogTitle>Delete Shortcut</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                &quot;{deleteTarget?.title}&quot;
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
