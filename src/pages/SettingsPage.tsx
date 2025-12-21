import { useState, useEffect } from 'react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import ApiKeyCard from '@/components/settings/ApiKeyCard';
import { supabase } from '@/integrations/supabase/client';
import { ChannelType } from '@/types/database';
import { Tables } from '@/integrations/supabase/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Settings, Key, Bell, Shield, Save, User, Mail, Phone, Globe } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

type ApiConfigRow = Tables<'api_configurations'>;

const channels: ChannelType[] = ['whatsapp', 'messenger', 'sms', 'voice', 'email'];

export default function SettingsPage() {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<Record<ChannelType, ApiConfigRow | null>>({
    whatsapp: null, messenger: null, sms: null, voice: null, email: null,
  });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
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

  useEffect(() => {
    fetchConfigs();
    fetchProfile();
  }, [user]);

  const fetchConfigs = async () => {
    const { data } = await supabase.from('api_configurations').select('*');
    const configMap: Record<ChannelType, ApiConfigRow | null> = {
      whatsapp: null, messenger: null, sms: null, voice: null, email: null,
    };
    (data || []).forEach(config => {
      configMap[config.channel as ChannelType] = config;
    });
    setConfigs(configMap);
    setLoading(false);
  };

  const fetchProfile = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setProfile(data);
    setProfileLoading(false);
  };

  const handleSave = async (channel: ChannelType, updateData: Record<string, unknown>) => {
    const existing = configs[channel];
    // Remove config_metadata from the update to avoid type issues
    const { config_metadata, ...safeData } = updateData as Record<string, unknown>;
    
    if (existing) {
      await supabase.from('api_configurations').update(safeData as any).eq('id', existing.id);
    } else {
      await supabase.from('api_configurations').insert({ ...safeData, channel } as any);
    }
    toast.success(`${channel} configuration saved`);
    fetchConfigs();
  };

  const handleSaveProfile = async () => {
    if (!user?.id || !profile) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone: profile.phone,
      })
      .eq('user_id', user.id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Profile updated successfully');
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: passwordData.newPassword,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated successfully');
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    }
  };

  const handleSaveNotifPrefs = () => {
    // In a real app, this would save to a user_preferences table
    localStorage.setItem('notification_preferences', JSON.stringify(notifPrefs));
    toast.success('Notification preferences saved');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Configure integrations, API keys, and system preferences.</p>
        </div>

        <Tabs defaultValue="integrations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="integrations" className="gap-2"><Key className="h-4 w-4" />Integrations</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" />Notifications</TabsTrigger>
            <TabsTrigger value="security" className="gap-2"><Shield className="h-4 w-4" />Security</TabsTrigger>
            <TabsTrigger value="general" className="gap-2"><Settings className="h-4 w-4" />General</TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-4">
            <Card className="border-border/50 bg-muted/20">
              <CardHeader>
                <CardTitle className="text-lg">Channel Integrations</CardTitle>
                <CardDescription>Configure API keys and credentials for each communication channel.</CardDescription>
              </CardHeader>
            </Card>
            
            {loading ? (
              <div className="grid gap-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}
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
                      setNotifPrefs((prev) => ({ ...prev, quietHours: checked }))
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
                          setNotifPrefs((prev) => ({ ...prev, quietStart: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={notifPrefs.quietEnd}
                        onChange={(e) =>
                          setNotifPrefs((prev) => ({ ...prev, quietEnd: e.target.value }))
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
                      setPasswordData((prev) => ({ ...prev, currentPassword: e.target.value }))
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
                      setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))
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
                      setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))
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
                  Session management coming soon. You can sign out from all devices by signing out and back in.
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
                            setProfile((prev: any) => ({ ...prev, first_name: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last Name</Label>
                        <Input
                          id="last-name"
                          value={profile.last_name || ""}
                          onChange={(e) =>
                            setProfile((prev: any) => ({ ...prev, last_name: e.target.value }))
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
                          setProfile((prev: any) => ({ ...prev, email: e.target.value }))
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
                          setProfile((prev: any) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Input
                        id="department"
                        value={profile.department || ""}
                        onChange={(e) =>
                          setProfile((prev: any) => ({ ...prev, department: e.target.value }))
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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}