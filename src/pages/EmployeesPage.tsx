import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import EmployeeCard from "@/components/employees/EmployeeCard";
import { supabase } from "@/integrations/supabase/client";
import { Employee, Profile, ChannelType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { LiveRegion } from "@/components/ui/live-region";
import {
  Search,
  Plus,
  Users,
  Star,
  Upload,
  Camera,
  Loader2,
} from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { AppRole } from "@/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ViewStatus } from "@/types/presentation";

export default function EmployeesPage() {
  const { t } = useTranslation();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  // Human-readable failure surfaced inside the create/edit dialog. Rendered via
  // an ErrorState (role="alert") so it is announced to AT, while the form's own
  // state retains the user's entered values (Requirement 18.4).
  const [formError, setFormError] = useState<string | null>(null);
  // Employee pending explicit delete confirmation (Requirement 18.8).
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(
    null,
  );

  const canManage =
    userRole === "admin" || userRole === "supervisor" || userRole === "manager";

  const {
    data: employees,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, profile:profiles(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []) as Array<Employee & { profile?: Profile }>;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("first_name");

      return (data || []) as Profile[];
    },
    enabled: canManage && isDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (employeeData: Partial<Employee>) => {
      const { data, error } = await supabase
        .from("employees")
        .insert(employeeData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      notifySuccess(t("employees.toasts.createdSuccess"));
      setFormError(null);
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      const message = error.message || t("employees.toasts.createFailed");
      setFormError(message);
      notifyError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Employee>) => {
      const { error } = await supabase
        .from("employees")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      notifySuccess(t("employees.toasts.updatedSuccess"));
      setFormError(null);
      setIsDialogOpen(false);
      setEditingEmployee(null);
    },
    onError: (error: Error) => {
      const message = error.message || t("employees.toasts.updateFailed");
      setFormError(message);
      notifyError(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      notifySuccess(t("employees.toasts.deletedSuccess"));
      setEmployeeToDelete(null);
    },
    onError: (error: Error) => {
      notifyError(error.message || t("employees.toasts.deleteFailed"));
    },
  });

  const filteredEmployees = employees?.filter((emp) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const name = emp.profile
      ? `${emp.profile.first_name || ""} ${emp.profile.last_name || ""}`.toLowerCase()
      : "";
    return (
      name.includes(term) ||
      emp.employee_code?.toLowerCase().includes(term) ||
      emp.department?.toLowerCase().includes(term)
    );
  });

  const handleEdit = (employee: Employee) => {
    setFormError(null);
    setEditingEmployee(employee);
    setIsDialogOpen(true);
  };

  // Opening the delete dialog only stages the record; the deletion itself is
  // performed once the user explicitly confirms (Requirement 18.8).
  const handleDelete = (employee: Employee) => {
    setEmployeeToDelete(employee);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const listStatus: ViewStatus = isError
    ? "error"
    : isLoading
      ? "loading"
      : filteredEmployees && filteredEmployees.length > 0
        ? "loaded"
        : "empty";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-display font-bold tracking-tight text-primary">
              {t("employees.title")}
            </h1>
            <p className="text-muted-foreground">{t("employees.subtitle")}</p>
          </div>
          {canManage && (
            <div className="flex gap-3">
              <CreateUserDialog />
              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  setFormError(null);
                  if (!open) setEditingEmployee(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-primary/20 hover:bg-primary/5"
                  >
                    <Plus
                      className="h-4 w-4 me-2 text-primary"
                      aria-hidden="true"
                    />
                    {t("employees.addEmployee")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <EmployeeForm
                    employee={editingEmployee}
                    profiles={profiles || []}
                    isSubmitting={isSubmitting}
                    submitError={formError}
                    onSubmit={(data) => {
                      setFormError(null);
                      if (editingEmployee) {
                        updateMutation.mutate({
                          id: editingEmployee.id,
                          ...data,
                        });
                      } else {
                        createMutation.mutate(data);
                      }
                    }}
                    onCancel={() => {
                      setIsDialogOpen(false);
                      setEditingEmployee(null);
                      setFormError(null);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* Team Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/10 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  {t("employees.stats.totalTeam")}
                </p>
                <h4 className="text-2xl font-bold text-primary">
                  {employees?.length || 0}
                </h4>
              </div>
              <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-status-success/5 border-status-success/10 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  {t("employees.stats.activeNow")}
                </p>
                <h4 className="text-2xl font-bold text-status-success">
                  {employees?.filter((e) => e.is_active).length || 0}
                </h4>
              </div>
              <div className="h-10 w-10 bg-status-success/10 rounded-xl flex items-center justify-center text-status-success">
                <div className="w-2.5 h-2.5 rounded-full bg-status-success motion-safe:animate-pulse" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-status-warning/5 border-status-warning/10 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  {t("employees.stats.avgPerformance")}
                </p>
                <h4 className="text-2xl font-bold text-status-warning-foreground">
                  {employees && employees.length > 0
                    ? (
                        (employees.reduce(
                          (acc, curr) => acc + (curr.performance_score || 0),
                          0,
                        ) /
                          employees.length) *
                        100
                      ).toFixed(0)
                    : 0}
                  %
                </h4>
              </div>
              <div className="h-10 w-10 bg-status-warning/10 rounded-xl flex items-center justify-center text-status-warning-foreground">
                <Star className="h-5 w-5 fill-current" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-status-info/5 border-status-info/10 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  {t("employees.stats.activeDepts")}
                </p>
                <h4 className="text-2xl font-bold text-status-info-foreground">
                  {new Set(employees?.map((e) => e.department).filter(Boolean))
                    .size || 0}
                </h4>
              </div>
              <div className="h-10 w-10 bg-status-info/10 rounded-xl flex items-center justify-center text-status-info-foreground">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search
            className="absolute start-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors"
            aria-hidden="true"
          />
          <Label htmlFor="employee-search" className="sr-only">
            {t("employees.searchLabel")}
          </Label>
          <Input
            id="employee-search"
            placeholder={t("employees.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ps-12 h-14 bg-card border-border/40 shadow-sm text-lg focus-visible:ring-primary/20 rounded-2xl"
          />
        </div>

        {/* Employees Grid — cards stack to a single column below md (768px) so
            every field is reachable without horizontal scrolling (Req 18.2). */}
        <AsyncBoundary
          status={listStatus}
          skeleton={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-lg" />
              ))}
            </div>
          }
          onRetry={() => refetch()}
          emptyTitle={t("employees.emptyTitle")}
          emptyDescription={t("employees.emptyDescription")}
          emptyIcon={<Users />}
          errorTitle={t("employees.errorTitle")}
          errorDescription={t("employees.errorDescription")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees?.map((employee) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                onEdit={canManage ? handleEdit : undefined}
                onDelete={canManage ? handleDelete : undefined}
              />
            ))}
          </div>
        </AsyncBoundary>
      </div>

      {/* Explicit delete confirmation (Requirement 18.8) with a loading state on
          the confirm control that blocks duplicate submission (Requirement 18.6). */}
      <AlertDialog
        open={employeeToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setEmployeeToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("employees.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("employees.delete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("employees.delete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                // Keep the dialog open while the deletion is in flight so the
                // loading state remains visible.
                e.preventDefault();
                if (employeeToDelete)
                  deleteMutation.mutate(employeeToDelete.id);
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  {t("employees.delete.deleting")}
                </>
              ) : (
                t("employees.delete.confirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function EmployeeForm({
  employee,
  profiles,
  isSubmitting,
  submitError,
  onSubmit,
  onCancel,
}: {
  employee?: Employee | null;
  profiles: Profile[];
  isSubmitting: boolean;
  submitError?: string | null;
  onSubmit: (data: Partial<Employee>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    profile_id: employee?.profile_id || "",
    employee_code: employee?.employee_code || "",
    department: employee?.department || "",
    shift_start: employee?.shift_start || "",
    shift_end: employee?.shift_end || "",
    assigned_channels: (employee?.assigned_channels || []) as ChannelType[],
    is_active: employee?.is_active ?? true,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(
    employee?.profile?.avatar_url || "",
  );
  const [uploading, setUploading] = useState(false);
  // Upload-step failures surfaced inline (announced via role="alert").
  const [uploadError, setUploadError] = useState<string | null>(null);

  const busy = uploading || isSubmitting;
  // Precedence: a mutation failure from the parent, else a local upload failure.
  const errorMessage = submitError ?? uploadError;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const channels: ChannelType[] = [
    "whatsapp",
    "messenger",
    "sms",
    "voice",
    "email",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Prevent duplicate submission while a save/upload is in flight (Req 18.6).
    if (busy) return;
    setUploadError(null);
    setUploading(true);

    try {
      let avatar_url = previewUrl;

      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const filePath = `${formData.profile_id}/${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, selectedFile, { upsert: true });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(filePath);

        avatar_url = publicUrl;

        // Update the profile with the new avatar_url
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ avatar_url })
          .eq("id", formData.profile_id);

        if (profileError) throw profileError;
      }

      onSubmit(formData);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : t("employees.form.uploadFailed");
      setUploadError(message);
      notifyError(message);
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const toggleChannel = (channel: ChannelType) => {
    setFormData((prev) => ({
      ...prev,
      assigned_channels: prev.assigned_channels.includes(channel)
        ? prev.assigned_channels.filter((c) => c !== channel)
        : [...prev.assigned_channels, channel],
    }));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {employee
            ? t("employees.form.editTitle")
            : t("employees.form.addTitle")}
        </DialogTitle>
        <DialogDescription>
          {employee
            ? t("employees.form.editDescription")
            : t("employees.form.addDescription")}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Operation-failure error, announced to AT (role="alert") while the
            entered values above remain intact (Requirement 18.4). */}
        {errorMessage ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <p className="font-semibold">{t("employees.form.errorTitle")}</p>
            <p className="text-destructive/90">{errorMessage}</p>
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-4 py-4 bg-muted/30 rounded-2xl border border-dashed border-border/60">
          <div className="relative group">
            <Avatar className="h-24 w-24 ring-4 ring-background shadow-md">
              <AvatarImage src={previewUrl} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {employee?.profile?.first_name?.charAt(0) || (
                  <Camera className="h-8 w-8 opacity-40" aria-hidden="true" />
                )}
              </AvatarFallback>
            </Avatar>
            <Label
              htmlFor="avatar-upload"
              className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity cursor-pointer"
            >
              <Upload className="h-6 w-6" aria-hidden="true" />
              <span className="sr-only">{t("employees.form.uploadPhoto")}</span>
            </Label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold">
              {t("employees.form.photoTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("employees.form.photoHint")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile_id">{t("employees.form.userProfile")}</Label>
          <Select
            value={formData.profile_id}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, profile_id: value }))
            }
          >
            <SelectTrigger id="profile_id">
              <SelectValue placeholder={t("employees.form.selectProfile")} />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.first_name} {profile.last_name} ({profile.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="employee_code">
            {t("employees.form.employeeCode")}
          </Label>
          <Input
            id="employee_code"
            value={formData.employee_code}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                employee_code: e.target.value,
              }))
            }
            placeholder="EMP001"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="department">{t("employees.form.department")}</Label>
          <Input
            id="department"
            value={formData.department}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, department: e.target.value }))
            }
            placeholder="Customer Service"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="shift_start">
              {t("employees.form.shiftStart")}
            </Label>
            <Input
              id="shift_start"
              type="time"
              value={formData.shift_start}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  shift_start: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift_end">{t("employees.form.shiftEnd")}</Label>
            <Input
              id="shift_end"
              type="time"
              value={formData.shift_end}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, shift_end: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("employees.form.assignedChannels")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {channels.map((channel) => (
              <div key={channel} className="flex items-center space-x-2">
                <Checkbox
                  id={channel}
                  checked={formData.assigned_channels.includes(channel)}
                  onCheckedChange={() => toggleChannel(channel)}
                />
                <Label
                  htmlFor={channel}
                  className="text-sm font-normal cursor-pointer"
                >
                  {t(`sessions.channels.${channel}`)}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({
                ...prev,
                is_active: checked as boolean,
              }))
            }
          />
          <Label
            htmlFor="is_active"
            className="text-sm font-normal cursor-pointer"
          >
            {t("employees.form.active")}
          </Label>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <Loader2
                  className="me-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                {t("employees.form.processing")}
              </>
            ) : (
              t("employees.form.saveChanges")
            )}
          </Button>
        </div>
      </form>
    </>
  );
}

function CreateUserDialog() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    first_name: "",
    last_name: "",
    role: "agent" as AppRole,
    phone: "",
    department: "",
  });

  const roles: AppRole[] = [
    "admin",
    "supervisor",
    "manager",
    "agent",
    "viewer",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Block duplicate submission while a request is in flight (Req 18.6).
    if (isLoading) return;

    if (formData.password !== formData.confirmPassword) {
      const msg = t("employees.createDialog.passwordsMismatch");
      setErrorMessage(msg);
      notifyError(msg);
      return;
    }

    if (formData.password.length < 6) {
      const msg = t("employees.createDialog.passwordTooShort");
      setErrorMessage(msg);
      notifyError(msg);
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const msg = t("employees.createDialog.mustBeLoggedIn");
        setErrorMessage(msg);
        notifyError(msg);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: formData.email,
          password: formData.password,
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
          phone: formData.phone || null,
          department: formData.department || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      notifySuccess(
        t("employees.createDialog.createdSuccess", {
          email: formData.email,
          role: t(`appShell.roles.${formData.role}`),
        }),
      );
      setErrorMessage(null);
      setIsOpen(false);
      setFormData({
        email: "",
        password: "",
        confirmPassword: "",
        first_name: "",
        last_name: "",
        role: "agent",
        phone: "",
        department: "",
      });

      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("employees.createDialog.createFailed");
      // Retain the user's entered values and announce the failure (Req 18.4).
      setErrorMessage(message);
      notifyError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setErrorMessage(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 me-2" aria-hidden="true" />
          {t("employees.createUser")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("employees.createDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("employees.createDialog.description")}
          </DialogDescription>
        </DialogHeader>
        {/* Live region ensures the failure is announced to AT within 1s even
            though the ErrorState below also carries role="alert" (Req 18.4). */}
        <LiveRegion
          message={errorMessage ?? ""}
          politeness="assertive"
          role="alert"
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <p className="font-semibold">
                {t("employees.createDialog.errorTitle")}
              </p>
              <p className="text-destructive/90">{errorMessage}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">
                {t("employees.createDialog.firstName")}
              </Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    first_name: e.target.value,
                  }))
                }
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">
                {t("employees.createDialog.lastName")}
              </Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    last_name: e.target.value,
                  }))
                }
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("employees.createDialog.email")} *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password">
                {t("employees.createDialog.password")} *
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                {t("employees.createDialog.confirmPassword")} *
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    confirmPassword: e.target.value,
                  }))
                }
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t("employees.createDialog.role")} *</Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, role: value as AppRole }))
              }
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`appShell.roles.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("employees.createDialog.phone")}</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+962791234567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create_department">
                {t("employees.createDialog.department")}
              </Label>
              <Input
                id="create_department"
                value={formData.department}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    department: e.target.value,
                  }))
                }
                placeholder="Support"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  {t("employees.createDialog.creating")}
                </>
              ) : (
                t("employees.createDialog.submit")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
