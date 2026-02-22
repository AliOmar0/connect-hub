import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChatShortcut } from "@/types/database";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Zap, Plus, Trash2, Edit2, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShortcutsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
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

      const data = {
        user_id: user.id,
        title: title.trim(),
        content: content.trim(),
      };

      if (editingShortcut) {
        const { error } = await supabase
          .from("chat_shortcuts")
          .update(data)
          .eq("id", editingShortcut.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chat_shortcuts").insert(data);
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
      toast.error(error.message || "Failed to save shortcut");
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
      toast.error(error.message || "Failed to delete shortcut");
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

  const filteredShortcuts = shortcuts?.filter(
    (s) =>
      s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.content.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary fill-primary/10" />
              Chat Shortcuts
            </h1>
            <p className="text-muted-foreground">
              Manage your personal quick replies to use in chats.
            </p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setIsAddEditOpen(true);
            }}
            className="shadow-smooth"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Shortcut
          </Button>
        </div>

        <Card className="border-none shadow-smooth overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or message content..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-background border-muted-foreground/20"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold px-6 py-4">
                    Title
                  </TableHead>
                  <TableHead className="font-semibold px-6 py-4">
                    Message Content
                  </TableHead>
                  <TableHead className="font-semibold px-6 py-4 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-6 py-4">
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <Skeleton className="h-8 w-20 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredShortcuts?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center py-20 text-muted-foreground"
                    >
                      <Zap className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No shortcuts found. Create one to get started!</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShortcuts?.map((shortcut) => (
                    <TableRow
                      key={shortcut.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="px-6 py-4 font-medium">
                        {shortcut.title}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-muted-foreground max-w-md truncate">
                        {shortcut.content}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
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
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Are you sure you want to delete this shortcut?",
                                )
                              ) {
                                deleteMutation.mutate(shortcut.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Shortcut Dialog */}
      <Dialog open={isAddEditOpen} onOpenChange={setIsAddEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingShortcut ? "Edit Shortcut" : "New Chat Shortcut"}
            </DialogTitle>
            <DialogDescription>
              Create a quick reply template. Use it in chat by typing \ or
              choosing from the shortcuts menu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Shortcut Title</Label>
              <Input
                id="title"
                placeholder="e.g. Welcome Message"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Response Content</Label>
              <Textarea
                id="content"
                placeholder="Type the message you want to save..."
                className="min-h-[150px] resize-none"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground bg-muted/50 p-2 rounded">
                Tip: Keep it professional and consistent. This text will be
                inserted exactly as typed.
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
              className="min-w-[100px]"
            >
              {saveMutation.isPending ? "Saving..." : "Save Shortcut"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
