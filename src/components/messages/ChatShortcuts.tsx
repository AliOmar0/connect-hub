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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { Zap, Plus, Settings2, Trash2, Edit2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ChatShortcutsProps {
  onSelect: (content: string) => void;
}

export default function ChatShortcuts({ onSelect }: ChatShortcutsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<ChatShortcut | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

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
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!title.trim() || !content.trim())
        throw new Error("Title and content are required");

      if (editingShortcut) {
        const { error } = await supabase
          .from("chat_shortcuts")
          .update({ title, content })
          .eq("id", editingShortcut.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chat_shortcuts").insert({
          user_id: user.id,
          title,
          content,
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
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setTitle("");
    setContent("");
    setEditingShortcut(null);
  };

  const handleEdit = (shortcut: ChatShortcut) => {
    setEditingShortcut(shortcut);
    setTitle(shortcut.title);
    setContent(shortcut.content);
    setIsAddEditOpen(true);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
            title="Chat Shortcuts"
          >
            <Zap className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search shortcuts..." />
            <CommandList>
              <CommandEmpty>No shortcuts found.</CommandEmpty>
              <CommandGroup heading="Your Shortcuts">
                {shortcuts?.map((shortcut) => (
                  <CommandItem
                    key={shortcut.id}
                    onSelect={() => {
                      onSelect(shortcut.content);
                      setOpen(false);
                    }}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span className="font-medium">{shortcut.title}</span>
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {shortcut.content}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="flex border-t border-border p-1 gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-xs justify-start h-8"
                onClick={() => {
                  resetForm();
                  setIsAddEditOpen(true);
                  setOpen(false);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                Add New
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs shrink-0 h-8"
                onClick={() => {
                  navigate("/shortcuts");
                  setOpen(false);
                }}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Manage Shortcuts Dialog */}
      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Chat Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {shortcuts?.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No shortcuts saved yet.
              </p>
            ) : (
              shortcuts?.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-start justify-between p-3 rounded-lg border border-border bg-muted/30 group hover:border-primary/30 transition-all"
                >
                  <div className="space-y-1 pr-4">
                    <h4 className="font-medium text-sm">{shortcut.title}</h4>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {shortcut.content}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleEdit(shortcut)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(shortcut.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              className="w-full"
              onClick={() => {
                resetForm();
                setIsAddEditOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Shortcut
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Shortcut Dialog */}
      <Dialog open={isAddEditOpen} onOpenChange={setIsAddEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingShortcut ? "Edit Shortcut" : "New Chat Shortcut"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Shortcut Title</Label>
              <Input
                id="title"
                placeholder="e.g. Greeting, Farewell, Refund Info"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Response Content</Label>
              <Textarea
                id="content"
                placeholder="Type the message to be inserted..."
                className="min-h-[120px]"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                This text will be inserted into the chat input when selected.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save Shortcut"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
