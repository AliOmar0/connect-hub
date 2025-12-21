import { useState, useEffect } from 'react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import ApiKeyCard from '@/components/settings/ApiKeyCard';
import { supabase } from '@/integrations/supabase/client';
import { ApiConfiguration, ChannelType } from '@/types/database';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Settings, Key, Bell, Shield } from 'lucide-react';

const channels: ChannelType[] = ['whatsapp', 'messenger', 'sms', 'voice', 'email'];

export default function SettingsPage() {
  const [configs, setConfigs] = useState<Record<ChannelType, ApiConfiguration | null>>({
    whatsapp: null, messenger: null, sms: null, voice: null, email: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    const { data } = await supabase.from('api_configurations').select('*');
    const configMap: Record<ChannelType, ApiConfiguration | null> = {
      whatsapp: null, messenger: null, sms: null, voice: null, email: null,
    };
    (data as ApiConfiguration[] || []).forEach(config => {
      configMap[config.channel] = config;
    });
    setConfigs(configMap);
    setLoading(false);
  };

  const handleSave = async (channel: ChannelType, data: Partial<ApiConfiguration>) => {
    const existing = configs[channel];
    if (existing) {
      await supabase.from('api_configurations').update(data).eq('id', existing.id);
    } else {
      await supabase.from('api_configurations').insert({ ...data, channel });
    }
    toast.success(`${channel} configuration saved`);
    fetchConfigs();
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

          <TabsContent value="notifications">
            <Card><CardContent className="pt-6 text-center text-muted-foreground py-12">
              Notification preferences coming soon
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="security">
            <Card><CardContent className="pt-6 text-center text-muted-foreground py-12">
              Security settings coming soon
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="general">
            <Card><CardContent className="pt-6 text-center text-muted-foreground py-12">
              General settings coming soon
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}