import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ApiKeyCard from "@/components/settings/ApiKeyCard";
import { supabase } from "@/integrations/supabase/client";
import { ChannelType, Profile, SessionMainType } from "@/types/database";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Settings,
  Key,
  Bell,
  Shield,
  Save,
  User,
  Mail,
  Phone,
  Globe,
  LayoutList,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  AlertCircle,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
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
      toast.error("Failed to load session types");
    } else {
      setSessionTypes((data as unknown as SessionMainType[]) || []);
    }
    setSessionTypesLoading(false);
  }, []);

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
      toast.error("You must be an admin to modify integrations.");
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
      toast.error(`Error saving configuration: ${error.message}`);
      throw error;
    }

    toast.success(`${channel} configuration saved`);
    fetchConfigs();
  };

  const handleSaveProfile = async () => {
    if (!user?.id || !profile) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated successfully");
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: passwordData.newPassword,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    }
  };

  const handleSaveNotifPrefs = () => {
    // In a real app, this would save to a user_preferences table
    localStorage.setItem(
      "notification_preferences",
      JSON.stringify(notifPrefs),
    );
    toast.success("Notification preferences saved");
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
      toast.error("You must be an admin to manage session types.");
      return;
    }

    if (!editingType?.name?.trim()) {
      toast.error("Name is required");
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
      toast.error("Failed to save session type");
    } else {
      toast.success(id ? "Updated successfully" : "Added successfully");
      setIsTypeDialogOpen(false);
      setEditingType(null);
      fetchSessionTypes();
    }
  };

  const handleDeleteSessionType = async (id: string) => {
    if (!isAdmin) {
      toast.error("You must be an admin to delete session types.");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to delete this session type? This might affect existing sessions.",
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("session_main_types")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting session type:", error);
      toast.error("Failed to delete session type");
    } else {
      toast.success("Session type deleted successfully");
      fetchSessionTypes();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Settings
          </h1>
          <p className="text-muted-foreground">
            Configure integrations, API keys, and system preferences.
          </p>
        </div>

        <Tabs defaultValue="integrations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="integrations" className="gap-2">
              <Key className="h-4 w-4" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-2">
              <Settings className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="session-types" className="gap-2">
              <LayoutList className="h-4 w-4" />
              Session Types
            </TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-4">
            <Card className="border-border/50 bg-muted/20">
              <CardHeader>
                <CardTitle className="text-lg">Channel Integrations</CardTitle>
                <CardDescription>
                  Configure API keys and credentials for each communication
                  channel.
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
                  <ApiKeyCard
                    key={channel}
                    channel={channel}
                    config={configs[channel]}
                    onSave={(data) => handleSave(channel, data)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Configure how and when you receive notifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via email
                    </p>
                  </div>
                  <Switch
                    checked={notifPrefs.email}
                    onCheckedChange={(checked) =>
                      setNotifPrefs((prev) => ({ ...prev, email: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>In-App Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Show notifications in the application
                    </p>
                  </div>
                  <Switch
                    checked={notifPrefs.inApp}
                    onCheckedChange={(checked) =>
                      setNotifPrefs((prev) => ({ ...prev, inApp: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Quiet Hours</Label>
                    <p className="text-sm text-muted-foreground">
                      Disable notifications during specific hours
                    </p>
                  </div>
                  <Switch
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
                      <Label>Start Time</Label>
                      <Input
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
                      <Label>End Time</Label>
                      <Input
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
                <Button onClick={handleSaveNotifPrefs}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Update your account password for better security.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        newPassword: e.target.value,
                      }))
                    }
                    placeholder="Enter new password (min 6 characters)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        confirmPassword: e.target.value,
                      }))
                    }
                    placeholder="Confirm new password"
                  />
                </div>
                <Button onClick={handleChangePassword}>
                  <Shield className="h-4 w-4 mr-2" />
                  Update Password
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  Manage your active sessions across devices.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Session management coming soon. You can sign out from all
                  devices by signing out and back in.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>
                  Update your personal information and preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {profileLoading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : profile ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">
                          <User className="h-4 w-4 inline mr-2" />
                          First Name
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
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last Name</Label>
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
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">
                        <Mail className="h-4 w-4 inline mr-2" />
                        Email
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
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">
                        <Phone className="h-4 w-4 inline mr-2" />
                        Phone
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={profile.phone || ""}
                        onChange={(e) =>
                          setProfile((prev) =>
                            prev ? { ...prev, phone: e.target.value } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
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
                      />
                    </div>
                    <Button onClick={handleSaveProfile}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Profile
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Profile not found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="session-types" className="space-y-4">
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Session Types & AI Knowledge</CardTitle>
                    <CardDescription>
                      Manage categories and factual knowledge used by the AI
                      assistant.
                    </CardDescription>
                  </div>
                  {isAdmin && (
                    <Button onClick={handleAddSessionType} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      New Type
                    </Button>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, category, or content..."
                    className="pl-9 pr-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {!isAdmin && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 p-3 rounded-lg flex items-start gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <p>
                      Only administrators can modify session types and AI
                      knowledge.
                    </p>
                  </div>
                )}

                {sessionTypesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sessionTypes.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed rounded-xl border-muted">
                        <LayoutList className="h-12 w-12 text-muted mx-auto mb-4" />
                        <p className="text-muted-foreground">
                          No session types defined yet.
                        </p>
                      </div>
                    ) : (
                      (() => {
                        const filtered = sessionTypes.filter(
                          (t) =>
                            t.name
                              .toLowerCase()
                              .includes(searchTerm.toLowerCase()) ||
                            t.parent_category
                              ?.toLowerCase()
                              .includes(searchTerm.toLowerCase()) ||
                            t.description
                              ?.toLowerCase()
                              .includes(searchTerm.toLowerCase()),
                        );

                        if (filtered.length === 0 && searchTerm) {
                          return (
                            <div className="text-center py-12">
                              <p className="text-muted-foreground">
                                No matches found for "{searchTerm}"
                              </p>
                              <Button
                                variant="ghost"
                                className="mt-2"
                                onClick={() => setSearchTerm("")}
                              >
                                Clear search
                              </Button>
                            </div>
                          );
                        }

                        // Group by parent_category
                        const grouped: Record<string, SessionMainType[]> = {};
                        filtered.forEach((type) => {
                          const cat = type.parent_category || "أخرى / Other";
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
                                    <div className="flex flex-col gap-1 pr-4">
                                      <span className="font-semibold text-primary">
                                        {type.name}
                                      </span>
                                      {type.description && (
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-w-2xl">
                                          {type.description}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {isAdmin && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={() =>
                                              handleEditSessionType(type)
                                            }
                                          >
                                            <Edit2 className="h-4 w-4 text-muted-foreground" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() =>
                                              handleDeleteSessionType(type.id)
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
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
                      ? "Edit Session Type"
                      : "Create New Session Type"}
                  </DialogTitle>
                  <DialogDescription>
                    Define a session category and provide detailed knowledge for
                    the AI assistant.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="type-name">Name (English or Arabic)</Label>
                    <Input
                      id="type-name"
                      placeholder="e.g. تمويل السيارات or Car Financing"
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
                    <Label htmlFor="type-category">Category (Grouping)</Label>
                    <Input
                      id="type-category"
                      placeholder="e.g. استفسارات or خدمات"
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
                      AI Knowledge / Description
                    </Label>
                    <Textarea
                      id="type-description"
                      placeholder="Provide detailed information that the AI should use when responding to this type of inquiry..."
                      className="min-h-[200px]"
                      value={editingType?.description || ""}
                      onChange={(e) =>
                        setEditingType((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      This content will be dynamically provided to the AI during
                      conversations.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsTypeDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSessionType}>Save Changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
