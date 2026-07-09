import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Edit2,
  LayoutList,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SessionMainType } from "@/types/database";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { KNOWLEDGE_BASE_API_URL, apiFetch } from "@/lib/config";

// Session type management moved here from SettingsPage: each type's
// description/ai_prompt is now also synced into the RAG vector store
// (source='session_type') via the backend, alongside its existing role of
// classifying sessions and being injected into the LLM's system prompt
// per-message (app/core/llm.py get_ai_response). See
// supabase/migrations/20260624000000_session_type_knowledge_source.sql.
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

async function syncSessionTypeToKnowledgeBase(
  sessionTypeId: string,
): Promise<void> {
  const res = await apiFetch(
    `${KNOWLEDGE_BASE_API_URL}/sync-session-type/${sessionTypeId}`,
    {
      method: "POST",
      headers: await authHeaders(),
    },
  );
  if (!res.ok) {
    // Non-fatal: the session type itself was already saved successfully in
    // Supabase; only the RAG-indexing step failed (e.g. backend offline).
    throw new Error("Knowledge base sync failed");
  }
}

async function deleteSessionTypeKnowledge(
  sessionTypeId: string,
): Promise<void> {
  const res = await apiFetch(
    `${KNOWLEDGE_BASE_API_URL}/sync-session-type/${sessionTypeId}`,
    {
      method: "DELETE",
      headers: await authHeaders(),
    },
  );
  if (!res.ok) {
    throw new Error("Knowledge base cleanup failed");
  }
}

export default function SessionTypesPanel() {
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";

  const [sessionTypes, setSessionTypes] = useState<SessionMainType[]>([]);
  const [sessionTypesLoading, setSessionTypesLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] =
    useState<Partial<SessionMainType> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSessionTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from("session_main_types")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching session types:", error);
      notifyError(t("kb.sessionTypes.saveFailed"));
    } else {
      setSessionTypes((data as unknown as SessionMainType[]) || []);
    }
    setSessionTypesLoading(false);
  }, [t]);

  useEffect(() => {
    fetchSessionTypes();
  }, [fetchSessionTypes]);

  const handleAddSessionType = () => {
    setEditingType({
      name: "",
      parent_category: "",
      description: "",
      ai_prompt: "",
    });
    setIsTypeDialogOpen(true);
  };

  const handleEditSessionType = (type: SessionMainType) => {
    setEditingType(type);
    setIsTypeDialogOpen(true);
  };

  const handleSaveSessionType = async () => {
    if (!isAdmin) {
      notifyError(t("kb.sessionTypes.adminOnlyManage"));
      return;
    }

    if (!editingType?.name?.trim()) {
      notifyError(t("kb.sessionTypes.nameRequired"));
      return;
    }

    setSaving(true);
    const { id, ...data } = editingType;
    let error;
    let savedId = id;

    if (id) {
      const { error: updateError } = await supabase
        .from("session_main_types")
        .update(data)
        .eq("id", id);
      error = updateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("session_main_types")
        .insert([
          data as {
            name: string;
            parent_category?: string;
            description?: string;
            ai_prompt?: string;
          },
        ])
        .select("id")
        .single();
      error = insertError;
      savedId = inserted?.id;
    }

    if (error) {
      console.error("Error saving session type:", error);
      notifyError(t("kb.sessionTypes.saveFailed"), {
        description: error.message,
      });
      setSaving(false);
      return;
    }

    // Sync into the RAG vector store so this content is retrievable by the
    // assistant, not just injected into the prompt per-message. Best-effort:
    // the session type itself is already saved even if this step fails.
    if (savedId) {
      try {
        await syncSessionTypeToKnowledgeBase(savedId);
      } catch (syncError) {
        console.error("Knowledge base sync failed:", syncError);
        notifyError(t("kb.sessionTypes.syncFailed"));
      }
    }

    notifySuccess(
      id
        ? t("kb.sessionTypes.updateSuccess")
        : t("kb.sessionTypes.createSuccess"),
    );
    setIsTypeDialogOpen(false);
    setEditingType(null);
    setSaving(false);
    fetchSessionTypes();
  };

  const handleDeleteSessionType = async (id: string) => {
    if (!isAdmin) {
      notifyError(t("kb.sessionTypes.adminOnlyDelete"));
      return;
    }

    if (!confirm(t("kb.sessionTypes.deleteConfirm"))) {
      return;
    }

    const { error } = await supabase
      .from("session_main_types")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting session type:", error);
      notifyError(t("kb.sessionTypes.deleteFailed"), {
        description: error.message,
      });
      return;
    }

    try {
      await deleteSessionTypeKnowledge(id);
    } catch (syncError) {
      console.error("Knowledge base cleanup failed:", syncError);
      // Non-fatal: the session type row is already gone.
    }

    notifySuccess(t("kb.sessionTypes.deleteSuccess"));
    fetchSessionTypes();
  };

  const filtered = sessionTypes.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.parent_category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const grouped: Record<string, SessionMainType[]> = {};
  filtered.forEach((type) => {
    const cat = type.parent_category || t("kb.sessionTypes.otherCategory");
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(type);
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>{t("kb.sessionTypes.title")}</CardTitle>
              <CardDescription>
                {t("kb.sessionTypes.description")}
              </CardDescription>
            </div>
            {isAdmin && (
              <Button
                onClick={handleAddSessionType}
                size="sm"
                className="min-h-[44px]"
              >
                <Plus className="h-4 w-4 me-2" aria-hidden="true" />
                {t("kb.sessionTypes.newType")}
              </Button>
            )}
          </div>

          <div className="relative">
            <Search
              className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label={t("kb.sessionTypes.searchPlaceholder")}
              placeholder={t("kb.sessionTypes.searchPlaceholder")}
              className="ps-9 pe-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                aria-label={t("kb.sessionTypes.clearSearch")}
                onClick={() => setSearchTerm("")}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isAdmin && (
            <div
              role="note"
              className="bg-status-warning/10 text-status-warning p-3 rounded-lg flex items-start gap-2 text-sm"
            >
              <AlertCircle className="h-4 w-4 mt-0.5" aria-hidden="true" />
              <p>{t("kb.sessionTypes.adminOnly")}</p>
            </div>
          )}

          {sessionTypesLoading ? (
            <div className="flex justify-center p-8">
              <Loader2
                className="h-8 w-8 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : sessionTypes.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl border-muted">
              <LayoutList
                className="h-12 w-12 text-muted mx-auto mb-4"
                aria-hidden="true"
              />
              <p className="text-muted-foreground">
                {t("kb.sessionTypes.empty")}
              </p>
            </div>
          ) : filtered.length === 0 && searchTerm ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {t("kb.sessionTypes.noMatches", { term: searchTerm })}
              </p>
              <Button
                variant="ghost"
                className="mt-2 min-h-[44px]"
                onClick={() => setSearchTerm("")}
              >
                {t("kb.sessionTypes.clearSearch")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([category, types]) => (
                <div key={category} className="space-y-3">
                  <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-2">
                    {category}
                  </h4>
                  <div className="grid gap-2">
                    {types.map((type) => (
                      <div
                        key={type.id}
                        className="group flex items-start justify-between p-4 border rounded-xl bg-card hover:bg-muted/30 transition-all shadow-sm"
                      >
                        <div className="flex flex-col gap-1 pe-4">
                          <span className="font-semibold text-primary">
                            {type.name}
                          </span>
                          {type.description && (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-w-2xl">
                              {type.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                          {isAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                aria-label={t("kb.sessionTypes.edit")}
                                title={t("kb.sessionTypes.edit")}
                                onClick={() => handleEditSessionType(type)}
                              >
                                <Edit2
                                  className="h-4 w-4 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 text-destructive hover:text-destructive hover:bg-destructive/10"
                                aria-label={t("kb.sessionTypes.delete")}
                                title={t("kb.sessionTypes.delete")}
                                onClick={() => handleDeleteSessionType(type.id)}
                              >
                                <Trash2
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingType?.id
                ? t("kb.sessionTypes.editTitle")
                : t("kb.sessionTypes.createTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("kb.sessionTypes.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="type-name">
                {t("kb.sessionTypes.nameLabel")}
              </Label>
              <Input
                id="type-name"
                placeholder={t("kb.sessionTypes.namePlaceholder")}
                value={editingType?.name || ""}
                onChange={(e) =>
                  setEditingType((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type-category">
                {t("kb.sessionTypes.categoryLabel")}
              </Label>
              <Input
                id="type-category"
                placeholder={t("kb.sessionTypes.categoryPlaceholder")}
                value={editingType?.parent_category || ""}
                onChange={(e) =>
                  setEditingType((prev) => ({
                    ...prev,
                    parent_category: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type-description">
                {t("kb.sessionTypes.knowledgeLabel")}
              </Label>
              <Textarea
                id="type-description"
                aria-describedby="type-description-hint"
                placeholder={t("kb.sessionTypes.knowledgePlaceholder")}
                className="min-h-[150px]"
                value={editingType?.description || ""}
                onChange={(e) =>
                  setEditingType((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
              <p
                id="type-description-hint"
                className="text-xs text-muted-foreground"
              >
                {t("kb.sessionTypes.knowledgeHint")}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type-ai-prompt">
                {t("kb.sessionTypes.aiPromptLabel")}
              </Label>
              <Textarea
                id="type-ai-prompt"
                aria-describedby="type-ai-prompt-hint"
                placeholder={t("kb.sessionTypes.aiPromptPlaceholder")}
                className="min-h-[150px]"
                value={editingType?.ai_prompt || ""}
                onChange={(e) =>
                  setEditingType((prev) => ({
                    ...prev,
                    ai_prompt: e.target.value,
                  }))
                }
              />
              <p
                id="type-ai-prompt-hint"
                className="text-xs text-muted-foreground"
              >
                {t("kb.sessionTypes.aiPromptHint")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setIsTypeDialogOpen(false)}
            >
              {t("kb.sessionTypes.cancel")}
            </Button>
            <Button
              className="min-h-[44px]"
              onClick={handleSaveSessionType}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? (
                <Loader2
                  className="h-4 w-4 me-2 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {t("kb.sessionTypes.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
