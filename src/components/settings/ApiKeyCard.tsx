import { useState } from 'react';
import { ChannelType } from '@/types/database';
import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  MessageSquare,
  Phone,
  Mail,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type ApiConfigRow = Tables<'api_configurations'>;

interface ApiKeyCardProps {
  channel: ChannelType;
  config: ApiConfigRow | null;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onTest?: () => Promise<boolean>;
}

const channelInfo: Record<ChannelType, { 
  name: string; 
  icon: React.ElementType; 
  color: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
}> = {
  whatsapp: {
    name: 'WhatsApp Business',
    icon: MessageCircle,
    color: 'text-green-600 bg-green-500/10',
    description: 'Connect your WhatsApp Business API for messaging',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', placeholder: 'Enter phone number ID' },
      { key: 'business_account_id', label: 'Business Account ID', placeholder: 'Enter business account ID' },
      { key: 'access_token_encrypted', label: 'Access Token', placeholder: 'Enter access token', secret: true },
    ]
  },
  messenger: {
    name: 'Facebook Messenger',
    icon: MessageSquare,
    color: 'text-blue-600 bg-blue-500/10',
    description: 'Connect your Facebook Page for Messenger integration',
    fields: [
      { key: 'business_account_id', label: 'Page ID', placeholder: 'Enter Facebook Page ID' },
      { key: 'access_token_encrypted', label: 'Page Access Token', placeholder: 'Enter page access token', secret: true },
    ]
  },
  sms: {
    name: 'SMS Gateway',
    icon: MessageSquare,
    color: 'text-purple-600 bg-purple-500/10',
    description: 'Configure SMS gateway for text messaging',
    fields: [
      { key: 'api_key_encrypted', label: 'API Key', placeholder: 'Enter API key', secret: true },
      { key: 'api_secret_encrypted', label: 'API Secret', placeholder: 'Enter API secret', secret: true },
      { key: 'phone_number_id', label: 'Sender ID', placeholder: 'Enter sender ID or number' },
    ]
  },
  voice: {
    name: 'Voice Calls',
    icon: Phone,
    color: 'text-orange-600 bg-orange-500/10',
    description: 'Set up voice calling capabilities',
    fields: [
      { key: 'api_key_encrypted', label: 'API Key', placeholder: 'Enter API key', secret: true },
      { key: 'api_secret_encrypted', label: 'API Secret', placeholder: 'Enter API secret', secret: true },
      { key: 'phone_number_id', label: 'Phone Number', placeholder: '+970599000000' },
    ]
  },
  email: {
    name: 'Email',
    icon: Mail,
    color: 'text-red-600 bg-red-500/10',
    description: 'Configure email integration for support',
    fields: [
      { key: 'api_key_encrypted', label: 'SMTP Host / API Key', placeholder: 'smtp.example.com or API key', secret: true },
      { key: 'api_secret_encrypted', label: 'Password / Secret', placeholder: 'Enter password or secret', secret: true },
    ]
  },
};

export default function ApiKeyCard({ channel, config, onSave, onTest }: ApiKeyCardProps) {
  const info = channelInfo[channel];
  const Icon = info.icon;
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});

  const handleEdit = () => {
    setFormData({
      phone_number_id: config?.phone_number_id || '',
      business_account_id: config?.business_account_id || '',
      access_token_encrypted: '',
      api_key_encrypted: '',
      api_secret_encrypted: '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        channel,
        ...formData,
        is_active: true,
      });
      setIsEditing(false);
    } catch (error) {
      // Error is handled by parent component
      // We catch it here to prevent unhandled rejection
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!onTest) return;
    setIsTesting(true);
    try {
      await onTest();
    } finally {
      setIsTesting(false);
    }
  };

  const toggleSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", info.color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{info.name}</CardTitle>
              <CardDescription className="text-sm mt-0.5">
                {info.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config?.is_active ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                <X className="h-3 w-3 mr-1" />
                Not configured
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isEditing ? (
          <div className="space-y-4">
            {info.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`${channel}-${field.key}`}>{field.label}</Label>
                <div className="relative">
                  <Input
                    id={`${channel}-${field.key}`}
                    type={field.secret && !showSecrets[field.key] ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    value={formData[field.key] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className={field.secret ? 'pr-10' : ''}
                  />
                  {field.secret && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => toggleSecret(field.key)}
                    >
                      {showSecrets[field.key] ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {config ? (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {config.phone_number_id && (
                    <div>
                      <p className="text-muted-foreground">Phone/Sender ID</p>
                      <p className="font-medium">{config.phone_number_id}</p>
                    </div>
                  )}
                  {config.business_account_id && (
                    <div>
                      <p className="text-muted-foreground">Account ID</p>
                      <p className="font-medium">{config.business_account_id}</p>
                    </div>
                  )}
                  {config.last_verified_at && (
                    <div>
                      <p className="text-muted-foreground">Last Verified</p>
                      <p className="font-medium">
                        {format(new Date(config.last_verified_at), 'MMM d, yyyy HH:mm')}
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={config.is_active} 
                      onCheckedChange={(checked) => onSave({ is_active: checked })}
                    />
                    <span className="text-sm text-muted-foreground">
                      {config.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {onTest && (
                      <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
                        {isTesting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Test
                          </>
                        )}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleEdit}>
                      Edit
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">
                  No configuration found. Set up your {info.name} integration.
                </p>
                <Button onClick={handleEdit}>
                  Configure {info.name}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
