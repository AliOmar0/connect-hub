import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ApiKeyCard from "@/components/settings/ApiKeyCard";
import TwilioDemo from "@/pages/TwilioDemo";
import { supabase } from "@/integrations/supabase/client";
import { ChannelType, Profile, SessionMainType } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tables } from "@/integrations/supabase/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Settings,
  Key,
  Bell,
  Shield,
  Save,
  LayoutList,
  Loader2,
  Plus,
  Trash2,
  Mic,
  Edit2,
  AlertCircle,
  Search,
  X,
  Palette,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import { notifySuccess, notifyError } from "@/lib/feedback";
import { BACKEND_URL, NODE_API_URL, apiFetch } from "@/lib/config";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type ApiConfigRow = Tables<"api_configurations">;

const channels: ChannelType[] = [
  "whatsapp",
  "messenger",
  "sms",
  "voice",
  "email",
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { user, userRole } = useAuth();
  const [configs, setConfigs] = useState<
    Record<ChannelType, ApiConfigRow | null>
  >({
    whatsapp: null,
    messenger: null,
    sms: null,
    voice: null,
    email: null,
  });
  const [sessionTypes, setSessionTypes] = useState<SessionMainType[]>([]);
  const [sessionTypesLoading, setSessionTypesLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] =
    useState<Partial<SessionMainType> | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    inApp: true,
    quietHours: false,
    quietStart: "22:00",
    quietEnd: "08:00",
  });

  // Security settings
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const isAdmin = userRole === "admin";

  const fetchConfigs = useCallback(async () => {
    // Only admins can see configs, but the RLS policies might allow reading if we changed them?
    // Based on current SQL, only admins can SELECT api_configurations.
    // So if not admin, this might return empty or error.
    const { data, error } = await supabase
      .from("api_configurations")
      .select("*");
    if (error) {
      console.log("Error fetching configs (likely permissions):", error);
      setLoading(false);
      return;
    }

    const configMap: Record<ChannelType, ApiConfigRow | null> = {
      whatsapp: null,
      messenger: null,
      sms: null,
      voice: null,
      email: null,
    };
    (data || []).forEach((config) => {
      configMap[config.channel as ChannelType] = config;
    });
    setConfigs(configMap);
    setLoading(false);
  }, []);

  const fetchSessionTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from("session_main_types")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching session types:", error);
      notifyError(t("settings.sessionTypes.saveFailed"));
    } else {
      setSessionTypes((data as unknown as SessionMainType[]) || []);
    }
    setSessionTypesLoading(false);
  }, [t]);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    setProfile(data);
    setProfileLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchConfigs();
    fetchProfile();
    fetchSessionTypes();
  }, [user, fetchConfigs, fetchProfile, fetchSessionTypes]);

  const handleSave = async (
    channel: ChannelType,
    updateData: Record<string, unknown>,
  ) => {
    if (!isAdmin) {
      notifyError(t("settings.integrations.adminOnly"));
      return;
    }

    const existing = configs[channel];
    // Remove config_metadata from the update to avoid type issues
    const { config_metadata, ...safeData } = updateData as Record<
      string,
      unknown
    >;

    let error;
    if (existing) {
      const { error: updateError } = await supabase
        .from("api_configurations")
        .update(safeData)
        .eq("id", existing.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("api_configurations")
        .insert({ ...safeData, channel });
      error = insertError;
    }

    if (error) {
      console.error("Error saving configuration:", error);
      // Surface a recoverable Error_State; the previously saved config is left
      // unchanged because we only refetch on success (Requirement 19.4).
      notifyError(t("settings.saveFailed"), { description: error.message });
      throw error;
    }

    notifySuccess(t("settings.integrations.saveSuccess"));
    fetchConfigs();
  };

  // Profile save wrapped in useAsyncAction: presents a loading state on the save
  // control, blocks duplicate submission while in flight (Requirement 19.6), and
  // exposes a retry recovery action on failure. Entered values stay in `profile`
  // state and previously saved settings are only refreshed on success, so a
  // failure leaves saved settings unchanged (Requirement 19.4).
  const saveProfileAction = useAsyncAction<[], void>(
    async () => {
      if (!user?.id || !profile) return;
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          phone: profile.phone,
          department: profile.department,
        })
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
    },
    {
      onSuccess: () => notifySuccess(t("settings.profile.saveSuccess")),
      onError: (err) =>
        notifyError(t("settings.saveFailed"), {
          description: err.message,
          action: {
            label: t("feedback.retry"),
            onClick: () => saveProfileAction.retry(),
          },
        }),
    },
  );
  const handleSaveProfile = () => saveProfileAction.run();

  const [avatarUploading, setAvatarUploading] = useState(false);
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setAvatarUploading(true);
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/${Math.random()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : null));
      notifySuccess(t("settings.profile.photoSuccess"));
    } catch (error) {
      const err = error as Error;
      notifyError(err.message || t("settings.profile.photoFailed"));
    } finally {
      setAvatarUploading(false);
    }
  };

  // Password change wrapped in useAsyncAction for the loading state and
  // duplicate-submit prevention (Requirement 19.6). On failure the entered
  // values are retained (we only clear them on success) and a retry recovery
  // action is offered (Requirement 19.4).
  const changePasswordAction = useAsyncAction<[], void>(
    async () => {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });
      if (error) throw new Error(error.message);
    },
    {
      onSuccess: () => {
        notifySuccess(t("settings.security.updateSuccess"));
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      },
      onError: (err) =>
        notifyError(t("settings.saveFailed"), {
          description: err.message,
          action: {
            label: t("feedback.retry"),
            onClick: () => changePasswordAction.retry(),
          },
        }),
    },
  );

  const handleChangePassword = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      notifyError(t("settings.security.mismatch"));
      return;
    }
    if (passwordData.newPassword.length < 6) {
      notifyError(t("settings.security.tooShort"));
      return;
    }
    changePasswordAction.run();
  };

  const handleSaveNotifPrefs = () => {
    // In a real app, this would save to a user_preferences table
    localStorage.setItem(
      "notification_preferences",
      JSON.stringify(notifPrefs),
    );
    notifySuccess(t("settings.notifications.saveSuccess"));
  };

  const handleAddSessionType = () => {
    setEditingType({ name: "", parent_category: "", description: "" });
    setIsTypeDialogOpen(true);
  };

  const handleEditSessionType = (type: SessionMainType) => {
    setEditingType(type);
    setIsTypeDialogOpen(true);
  };

  const handleSaveSessionType = async () => {
    if (!isAdmin) {
      notifyError(t("settings.sessionTypes.adminOnlyManage"));
      return;
    }

    if (!editingType?.name?.trim()) {
      notifyError(t("settings.sessionTypes.nameRequired"));
      return;
    }

    const { id, ...data } = editingType;
    let error;

    if (id) {
      // Update
      const { error: updateError } = await supabase
        .from("session_main_types")
        .update(data)
        .eq("id", id);
      error = updateError;
    } else {
      // Create
      const { error: insertError } = await supabase
        .from("session_main_types")
        .insert([
          data as {
            name: string;
            parent_category?: string;
            description?: string;
          },
        ]);
      error = insertError;
    }

    if (error) {
      console.error("Error saving session type:", error);
      notifyError(t("settings.sessionTypes.saveFailed"), {
        description: error.message,
      });
    } else {
      notifySuccess(
        id
          ? t("settings.sessionTypes.updateSuccess")
          : t("settings.sessionTypes.createSuccess"),
      );
      setIsTypeDialogOpen(false);
      setEditingType(null);
      fetchSessionTypes();
    }
  };

  const handleDeleteSessionType = async (id: string) => {
    if (!isAdmin) {
      notifyError(t("settings.sessionTypes.adminOnlyDelete"));
      return;
    }

    if (!confirm(t("settings.sessionTypes.deleteConfirm"))) {
      return;
    }

    const { error } = await supabase
      .from("session_main_types")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting session type:", error);
      notifyError(t("settings.sessionTypes.deleteFailed"), {
        description: error.message,
      });
    } else {
      notifySuccess(t("settings.sessionTypes.deleteSuccess"));
      fetchSessionTypes();
    }
  };

  const [smsData, setSmsData] = useState({
    to: "",
    message: "Test message from PIB Connect Hub",
  });
  const [smsSending, setSmsSending] = useState(false);

  const handleSendTestSms = async () => {
    if (!smsData.to || !smsData.message) {
      notifyError(t("settings.integrations.smsMissingFields"));
      return;
    }
    setSmsSending(true);
    try {
      const response = await fetch("http://localhost:3001/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smsData),
      });
      const data = await response.json();
      if (response.ok) {
        notifySuccess(t("settings.integrations.smsSuccess"), {
          description: `SID: ${data.sid}`,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (err: unknown) {
      const error = err as Error;
      notifyError(t("settings.integrations.smsFailed"), {
        description: error.message,
      });
    } finally {
      setSmsSending(false);
    }
  };

  const handleTestConfig = async (channel: ChannelType): Promise<boolean> => {
    try {
      if (channel === "voice") {
        const response = await apiFetch(`${NODE_API_URL}/api/token`);
        const data = await response.json();
        if (response.ok && data.token) {
          notifySuccess("Voice Gateway is Online and Ready");
          return true;
        } else {
          throw new Error(data.error || "Failed to get token");
        }
      } else if (channel === "sms") {
        // Simple health check or ping
        const response = await apiFetch(`${NODE_API_URL}/`);
        if (response.ok) {
          notifySuccess("SMS Gateway Server is Responsive");
          return true;
        } else {
          throw new Error("Gateway server unreachable");
        }
      } else if (channel === "whatsapp") {
        // Health check against configured backend URL.
        const response = await apiFetch(`${BACKEND_URL}/health`);
        if (response.ok) {
          notifySuccess("WhatsApp Backend is Online");
          return true;
        } else {
          throw new Error("WhatsApp backend unreachable");
        }
      }
      return false;
    } catch (err: unknown) {
      const error = err as Error;
      notifyError(`Test failed: ${error.message}`);
      return false;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            {t("settings.title")}
          </h1>
          <p className="text-muted-foreground">{t("settings.subtitle")}</p>
        </div>

        <Tabs defaultValue="integrations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="integrations" className="gap-2">
              <Key className="h-4 w-4" aria-hidden="true" />
              {t("settings.tabs.integrations")}
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" aria-hidden="true" />
              {t("settings.tabs.notifications")}
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" aria-hidden="true" />
              {t("settings.tabs.security")}
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Palette className="h-4 w-4" aria-hidden="true" />
              {t("settings.tabs.appearance")}
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-2">
              <Settings className="h-4 w-4" aria-hidden="true" />
              {t("settings.tabs.general")}
            </TabsTrigger>
            <TabsTrigger value="session-types" className="gap-2">
              <LayoutList className="h-4 w-4" aria-hidden="true" />
              {t("settings.tabs.sessionTypes")}
            </TabsTrigger>
            <TabsTrigger value="twilio" className="gap-2">
              <Mic className="h-4 w-4" aria-hidden="true" />
              {t("settings.tabs.voiceTesting")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-4">
            <Card className="border-border/50 bg-muted/20">
              <CardHeader>
                <CardTitle className="text-lg">
                  {t("settings.integrations.title")}
                </CardTitle>
                <CardDescription>
                  {t("settings.integrations.description")}
                </CardDescription>
              </CardHeader>
            </Card>

            {loading ? (
              <div className="grid gap-4">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-48 bg-muted animate-pulse rounded-xl"
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {channels.map((channel) => (
                  <div key={channel} className="space-y-4">
                    <ApiKeyCard
                      channel={channel}
                      config={configs[channel]}
                      onSave={(data) => handleSave(channel, data)}
                      onTest={() => handleTestConfig(channel)}
                    />
                    {channel === "sms" && configs[channel]?.is_active && (
                      <Card className="border-dashed border-primary/20 bg-primary/5">
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">
                            {t("settings.integrations.smsTest")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-4">
                          <div className="flex gap-2">
                            <Input
                              id="sms-test-to"
                              aria-label={t("settings.integrations.smsTest")}
                              placeholder="+970..."
                              size={30}
                              value={smsData.to}
                              onChange={(e) =>
                                setSmsData({ ...smsData, to: e.target.value })
                              }
                            />
                            <Button
                              size="sm"
                              className="min-h-[44px]"
                              disabled={smsSending}
                              aria-busy={smsSending}
                              onClick={handleSendTestSms}
                            >
                              {smsSending ? (
                                <Loader2
                                  className="h-4 w-4 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                t("settings.integrations.sendTest")
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.notifications.title")}</CardTitle>
                <CardDescription>
                  {t("settings.notifications.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="notif-email">
                      {t("settings.notifications.email")}
                    </Label>
                    <p
                      id="notif-email-desc"
                      className="text-sm text-muted-foreground"
                    >
                      {t("settings.notifications.emailDescription")}
                    </p>
                  </div>
                  <Switch
                    id="notif-email"
                    aria-describedby="notif-email-desc"
                    checked={notifPrefs.email}
                    onCheckedChange={(checked) =>
                      setNotifPrefs((prev) => ({ ...prev, email: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="notif-inapp">
                      {t("settings.notifications.inApp")}
                    </Label>
                    <p
                      id="notif-inapp-desc"
                      className="text-sm text-muted-foreground"
                    >
                      {t("settings.notifications.inAppDescription")}
                    </p>
                  </div>
                  <Switch
                    id="notif-inapp"
                    aria-describedby="notif-inapp-desc"
                    checked={notifPrefs.inApp}
                    onCheckedChange={(checked) =>
                      setNotifPrefs((prev) => ({ ...prev, inApp: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="notif-quiet">
                      {t("settings.notifications.quietHours")}
                    </Label>
                    <p
                      id="notif-quiet-desc"
                      className="text-sm text-muted-foreground"
                    >
                      {t("settings.notifications.quietHoursDescription")}
                    </p>
                  </div>
                  <Switch
                    id="notif-quiet"
                    aria-describedby="notif-quiet-desc"
                    checked={notifPrefs.quietHours}
                    onCheckedChange={(checked) =>
                      setNotifPrefs((prev) => ({
                        ...prev,
                        quietHours: checked,
                      }))
                    }
                  />
                </div>
                {notifPrefs.quietHours && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="notif-quiet-start">
                        {t("settings.notifications.startTime")}
                      </Label>
                      <Input
                        id="notif-quiet-start"
                        type="time"
                        value={notifPrefs.quietStart}
                        onChange={(e) =>
                          setNotifPrefs((prev) => ({
                            ...prev,
                            quietStart: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notif-quiet-end">
                        {t("settings.notifications.endTime")}
                      </Label>
                      <Input
                        id="notif-quiet-end"
                        type="time"
                        value={notifPrefs.quietEnd}
                        onChange={(e) =>
                          setNotifPrefs((prev) => ({
                            ...prev,
                            quietEnd: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
                <Button onClick={handleSaveNotifPrefs} className="min-h-[44px]">
                  <Save className="h-4 w-4 me-2" aria-hidden="true" />
                  {t("settings.notifications.save")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.appearance.title")}</CardTitle>
                <CardDescription>
                  {t("settings.appearance.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label id="theme-label">
                    {t("settings.appearance.theme")}
                  </Label>
                  <p id="theme-desc" className="text-sm text-muted-foreground">
                    {t("settings.appearance.themeDescription")}
                  </p>
                  {/*
                    Theme switching between light and dark (Requirement 19.5).
                    Selecting an option calls setTheme, which toggles the `.dark`
                    class on the document root so the token set resolves across
                    every page within 1s and without a reload (Requirement 19.7).
                  */}
                  <RadioGroup
                    aria-labelledby="theme-label"
                    aria-describedby="theme-desc"
                    value={theme}
                    onValueChange={(value) =>
                      setTheme(value === "dark" ? "dark" : "light")
                    }
                    className="grid max-w-md grid-cols-2 gap-3 pt-2"
                  >
                    <Label
                      htmlFor="theme-light"
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/30"
                    >
                      <RadioGroupItem value="light" id="theme-light" />
                      <Sun
                        className="h-5 w-5 text-status-warning"
                        aria-hidden="true"
                      />
                      <span className="font-medium">
                        {t("settings.appearance.light")}
                      </span>
                    </Label>
                    <Label
                      htmlFor="theme-dark"
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/30"
                    >
                      <RadioGroupItem value="dark" id="theme-dark" />
                      <Moon
                        className="h-5 w-5 text-primary"
                        aria-hidden="true"
                      />
                      <span className="font-medium">
                        {t("settings.appearance.dark")}
                      </span>
                    </Label>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.security.title")}</CardTitle>
                <CardDescription>
                  {t("settings.security.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">
                    {t("settings.security.currentPassword")}
                  </Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                    placeholder={t(
                      "settings.security.currentPasswordPlaceholder",
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">
                    {t("settings.security.newPassword")}
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        newPassword: e.target.value,
                      }))
                    }
                    placeholder={t("settings.security.newPasswordPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">
                    {t("settings.security.confirmPassword")}
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        confirmPassword: e.target.value,
                      }))
                    }
                    placeholder={t(
                      "settings.security.confirmPasswordPlaceholder",
                    )}
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  className="min-h-[44px]"
                  disabled={changePasswordAction.isLoading}
                  aria-busy={changePasswordAction.isLoading}
                >
                  {changePasswordAction.isLoading ? (
                    <Loader2
                      className="h-4 w-4 me-2 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Shield className="h-4 w-4 me-2" aria-hidden="true" />
                  )}
                  {changePasswordAction.isLoading
                    ? t("settings.security.updating")
                    : t("settings.security.update")}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.security.sessionsTitle")}</CardTitle>
                <CardDescription>
                  {t("settings.security.sessionsDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t("settings.security.sessionsHint")}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.profile.title")}</CardTitle>
                <CardDescription>
                  {t("settings.profile.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {profileLoading ? (
                  <div className="text-center py-12 flex flex-col items-center gap-4">
                    <Loader2
                      className="h-8 w-8 animate-spin text-primary"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-muted-foreground font-medium">
                      {t("settings.profile.loading")}
                    </p>
                  </div>
                ) : profile ? (
                  <>
                    <div className="flex flex-col items-center sm:flex-row gap-6 p-6 rounded-2xl bg-primary/5 border border-primary/10">
                      <div className="relative group">
                        <div className="w-24 h-24 rounded-full bg-gradient-navy-gold p-1 shadow-lg relative">
                          <div className="w-full h-full rounded-full bg-card flex items-center justify-center overflow-hidden">
                            <Avatar className="h-full w-full">
                              <AvatarImage
                                src={
                                  profile.avatar_url ||
                                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.email}`
                                }
                              />
                              <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                                {profile.first_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                          {avatarUploading && (
                            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        <Label
                          htmlFor="settings-avatar-upload"
                          aria-label={t("settings.profile.changePhoto")}
                          className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full shadow-md border-2 border-background bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors cursor-pointer opacity-100"
                        >
                          <Edit2 className="h-3 w-3" aria-hidden="true" />
                        </Label>
                        <input
                          id="settings-avatar-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          disabled={avatarUploading}
                          className="hidden"
                        />
                      </div>
                      <div className="space-y-1 text-center sm:text-left">
                        <h3 className="text-xl font-bold text-primary">
                          {profile.first_name} {profile.last_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {profile.email}
                        </p>
                        <Badge
                          variant="outline"
                          className="mt-2 bg-background/50 uppercase tracking-tighter"
                        >
                          {userRole}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">
                          {t("settings.profile.firstName")}
                        </Label>
                        <Input
                          id="first-name"
                          value={profile.first_name || ""}
                          onChange={(e) =>
                            setProfile((prev) =>
                              prev
                                ? { ...prev, first_name: e.target.value }
                                : null,
                            )
                          }
                          className="h-11 border-border/60 focus-visible:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">
                          {t("settings.profile.lastName")}
                        </Label>
                        <Input
                          id="last-name"
                          value={profile.last_name || ""}
                          onChange={(e) =>
                            setProfile((prev) =>
                              prev
                                ? { ...prev, last_name: e.target.value }
                                : null,
                            )
                          }
                          className="h-11 border-border/60 focus-visible:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">
                          {t("settings.profile.email")}
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={profile.email || ""}
                          onChange={(e) =>
                            setProfile((prev) =>
                              prev ? { ...prev, email: e.target.value } : null,
                            )
                          }
                          className="h-11 border-border/60 focus-visible:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">
                          {t("settings.profile.phone")}
                        </Label>
                        <Input
                          id="phone"
                          type="tel"
                          dir="ltr"
                          value={profile.phone || ""}
                          onChange={(e) =>
                            setProfile((prev) =>
                              prev ? { ...prev, phone: e.target.value } : null,
                            )
                          }
                          className="h-11 border-border/60 focus-visible:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="department">
                          {t("settings.profile.department")}
                        </Label>
                        <Input
                          id="department"
                          value={profile.department || ""}
                          onChange={(e) =>
                            setProfile((prev) =>
                              prev
                                ? { ...prev, department: e.target.value }
                                : null,
                            )
                          }
                          className="h-11 border-border/60 focus-visible:ring-primary/20"
                        />
                      </div>
                    </div>
                    <div className="pt-4 flex justify-end">
                      <Button
                        onClick={handleSaveProfile}
                        disabled={saveProfileAction.isLoading}
                        aria-busy={saveProfileAction.isLoading}
                        className="px-8 h-12 text-md font-bold shadow-lg shadow-primary/20"
                      >
                        {saveProfileAction.isLoading ? (
                          <Loader2
                            className="h-5 w-5 me-3 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Save className="h-5 w-5 me-3" aria-hidden="true" />
                        )}
                        {saveProfileAction.isLoading
                          ? t("settings.profile.saving")
                          : t("settings.profile.save")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground font-medium">
                    {t("settings.profile.notFound")}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="session-types" className="space-y-4">
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>{t("settings.sessionTypes.title")}</CardTitle>
                    <CardDescription>
                      {t("settings.sessionTypes.description")}
                    </CardDescription>
                  </div>
                  {isAdmin && (
                    <Button
                      onClick={handleAddSessionType}
                      size="sm"
                      className="min-h-[44px]"
                    >
                      <Plus className="h-4 w-4 me-2" aria-hidden="true" />
                      {t("settings.sessionTypes.newType")}
                    </Button>
                  )}
                </div>

                <div className="relative">
                  <Search
                    className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    aria-label={t("settings.sessionTypes.searchPlaceholder")}
                    placeholder={t("settings.sessionTypes.searchPlaceholder")}
                    className="ps-9 pe-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      aria-label={t("settings.sessionTypes.clearSearch")}
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
                    <AlertCircle
                      className="h-4 w-4 mt-0.5"
                      aria-hidden="true"
                    />
                    <p>{t("settings.sessionTypes.adminOnly")}</p>
                  </div>
                )}

                {sessionTypesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2
                      className="h-8 w-8 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sessionTypes.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed rounded-xl border-muted">
                        <LayoutList
                          className="h-12 w-12 text-muted mx-auto mb-4"
                          aria-hidden="true"
                        />
                        <p className="text-muted-foreground">
                          {t("settings.sessionTypes.empty")}
                        </p>
                      </div>
                    ) : (
                      (() => {
                        const filtered = sessionTypes.filter(
                          (item) =>
                            item.name
                              .toLowerCase()
                              .includes(searchTerm.toLowerCase()) ||
                            item.parent_category
                              ?.toLowerCase()
                              .includes(searchTerm.toLowerCase()) ||
                            item.description
                              ?.toLowerCase()
                              .includes(searchTerm.toLowerCase()),
                        );

                        if (filtered.length === 0 && searchTerm) {
                          return (
                            <div className="text-center py-12">
                              <p className="text-muted-foreground">
                                {t("settings.sessionTypes.noMatches", {
                                  term: searchTerm,
                                })}
                              </p>
                              <Button
                                variant="ghost"
                                className="mt-2 min-h-[44px]"
                                onClick={() => setSearchTerm("")}
                              >
                                {t("settings.sessionTypes.clearSearch")}
                              </Button>
                            </div>
                          );
                        }

                        // Group by parent_category
                        const grouped: Record<string, SessionMainType[]> = {};
                        filtered.forEach((type) => {
                          const cat =
                            type.parent_category ||
                            t("settings.sessionTypes.otherCategory");
                          if (!grouped[cat]) grouped[cat] = [];
                          grouped[cat].push(type);
                        });
                        return Object.entries(grouped).map(
                          ([category, types]) => (
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
                                            aria-label={t(
                                              "settings.sessionTypes.edit",
                                            )}
                                            title={t(
                                              "settings.sessionTypes.edit",
                                            )}
                                            onClick={() =>
                                              handleEditSessionType(type)
                                            }
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
                                            aria-label={t(
                                              "settings.sessionTypes.delete",
                                            )}
                                            title={t(
                                              "settings.sessionTypes.delete",
                                            )}
                                            onClick={() =>
                                              handleDeleteSessionType(type.id)
                                            }
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
                          ),
                        );
                      })()
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingType?.id
                      ? t("settings.sessionTypes.editTitle")
                      : t("settings.sessionTypes.createTitle")}
                  </DialogTitle>
                  <DialogDescription>
                    {t("settings.sessionTypes.dialogDescription")}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="type-name">
                      {t("settings.sessionTypes.nameLabel")}
                    </Label>
                    <Input
                      id="type-name"
                      placeholder={t("settings.sessionTypes.namePlaceholder")}
                      value={editingType?.name || ""}
                      onChange={(e) =>
                        setEditingType((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type-category">
                      {t("settings.sessionTypes.categoryLabel")}
                    </Label>
                    <Input
                      id="type-category"
                      placeholder={t(
                        "settings.sessionTypes.categoryPlaceholder",
                      )}
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
                      {t("settings.sessionTypes.knowledgeLabel")}
                    </Label>
                    <Textarea
                      id="type-description"
                      aria-describedby="type-description-hint"
                      placeholder={t(
                        "settings.sessionTypes.knowledgePlaceholder",
                      )}
                      className="min-h-[200px]"
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
                      {t("settings.sessionTypes.knowledgeHint")}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={() => setIsTypeDialogOpen(false)}
                  >
                    {t("settings.sessionTypes.cancel")}
                  </Button>
                  <Button
                    className="min-h-[44px]"
                    onClick={handleSaveSessionType}
                  >
                    {t("settings.sessionTypes.save")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="twilio" className="space-y-4">
            <TwilioDemo />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
