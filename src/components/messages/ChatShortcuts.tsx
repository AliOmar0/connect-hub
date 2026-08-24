import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChatShortcut } from "@/types/database";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, Plus, Trash2, Edit2, Search, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChatShortcutsProps {
  onSelect: (content: string) => void;
}

export default function ChatShortcuts({ onSelect }: ChatShortcutsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Popover state
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Add/Edit dialog state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<ChatShortcut | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<ChatShortcut | null>(null);

  // Manage mode inside popover
  const [manageMode, setManageMode] = useState(false);

  const { data: shortcuts, isLoading } = useQuery({
    queryKey: ["chat-shortcuts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("chat_shortcuts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching shortcuts:", error);
        return [];
      }
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

  const handleOpenEdit = (shortcut: ChatShortcut, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingShortcut(shortcut);
    setTitle(shortcut.title);
    setContent(shortcut.content);
    setIsAddEditOpen(true);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddEditOpen(true);
    setOpen(false);
  };

  const handleDeleteClick = (shortcut: ChatShortcut, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(shortcut);
  };

  const filteredShortcuts =
    shortcuts?.filter(
      (s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.content.toLowerCase().includes(searchQuery.toLowerCase()),
    ) ?? [];

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setSearchQuery("");
            setManageMode(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
            title="Chat Shortcuts (type \ to quick-insert)"
            id="chat-shortcuts-trigger"
          >
            <Zap className="h-5 w-5" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[320px] p-0 shadow-xl border-border/60"
          align="start"
          side="top"
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                {manageMode ? "Manage Shortcuts" : "Quick Replies"}
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-caption text-muted-foreground hover:text-primary"
                onClick={() => setManageMode((m) => !m)}
              >
                {manageMode ? "Done" : "Manage"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-primary"
                onClick={handleOpenAdd}
                title="Add new shortcut"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="px-2 pt-2 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search shortcuts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-muted/40 border-muted-foreground/15 focus-visible:ring-primary/20"
                id="shortcuts-search"
              />
            </div>
          </div>

          {/* List */}
          <ScrollArea className="max-h-[260px]">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Loading shortcuts...
              </div>
            ) : filteredShortcuts.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Zap className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  {searchQuery
                    ? "No shortcuts match your search."
                    : "No shortcuts yet."}
                </p>
                {!searchQuery && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={handleOpenAdd}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add your first shortcut
                  </Button>
                )}
              </div>
            ) : (
              <div className="p-1.5 space-y-0.5">
                {filteredShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors",
                      manageMode
                        ? "hover:bg-muted/60 cursor-default"
                        : "hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    )}
                    onClick={() => {
                      if (!manageMode) {
                        onSelect(shortcut.content);
                        setOpen(false);
                        setSearchQuery("");
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-none mb-0.5">
                        {shortcut.title}
                      </p>
                      <p className="text-caption text-muted-foreground truncate">
                        {shortcut.content}
                      </p>
                    </div>

                    {manageMode ? (
                      <div className="flex gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={(e) => handleOpenEdit(shortcut, e)}
                          title="Edit shortcut"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDeleteClick(shortcut, e)}
                          title="Delete shortcut"
                          disabled={
                            deleteMutation.isPending &&
                            deleteTarget?.id === shortcut.id
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-accent-foreground/50 transition-colors" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer tip */}
          {!manageMode && filteredShortcuts.length > 0 && (
            <div className="px-3 py-2 border-t border-border bg-muted/20">
              <p className="text-caption text-muted-foreground">
                Tip: Type{" "}
                <kbd className="px-1 py-0.5 bg-muted rounded text-caption font-mono border border-border">
                  \
                </kbd>{" "}
                in the chat to quick-insert a shortcut
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Add / Edit Shortcut Dialog ── */}
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
              <Label htmlFor="shortcut-title">Shortcut Title</Label>
              <Input
                id="shortcut-title"
                placeholder="e.g. Greeting, Farewell, Refund Info"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
              <p className="text-caption text-muted-foreground">
                Used to search and identify this shortcut.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shortcut-content">Response Content</Label>
              <Textarea
                id="shortcut-content"
                placeholder="Type the message to be inserted into the chat..."
                className="min-h-[120px] resize-none"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <p className="text-caption text-muted-foreground">
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

      {/* ── Delete Confirmation AlertDialog ── */}
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
    </>
  );
}
