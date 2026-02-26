export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  public: {
    Tables: {
      analytics_daily: {
        Row: {
          avg_response_time_seconds: number | null;
          avg_satisfaction_score: number | null;
          channel: Database["public"]["Enums"]["channel_type"] | null;
          created_at: string | null;
          date: string;
          escalation_count: number | null;
          id: string;
          total_calls: number | null;
          total_messages: number | null;
          total_sessions: number | null;
        };
        Insert: {
          avg_response_time_seconds?: number | null;
          avg_satisfaction_score?: number | null;
          channel?: Database["public"]["Enums"]["channel_type"] | null;
          created_at?: string | null;
          date: string;
          escalation_count?: number | null;
          id?: string;
          total_calls?: number | null;
          total_messages?: number | null;
          total_sessions?: number | null;
        };
        Update: {
          avg_response_time_seconds?: number | null;
          avg_satisfaction_score?: number | null;
          channel?: Database["public"]["Enums"]["channel_type"] | null;
          created_at?: string | null;
          date?: string;
          escalation_count?: number | null;
          id?: string;
          total_calls?: number | null;
          total_messages?: number | null;
          total_sessions?: number | null;
        };
        Relationships: [];
      };
      api_configurations: {
        Row: {
          access_token_encrypted: string | null;
          api_key_encrypted: string | null;
          api_secret_encrypted: string | null;
          business_account_id: string | null;
          channel: Database["public"]["Enums"]["channel_type"];
          config_metadata: Json | null;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          last_verified_at: string | null;
          phone_number_id: string | null;
          updated_at: string | null;
          webhook_url: string | null;
        };
        Insert: {
          access_token_encrypted?: string | null;
          api_key_encrypted?: string | null;
          api_secret_encrypted?: string | null;
          business_account_id?: string | null;
          channel: Database["public"]["Enums"]["channel_type"];
          config_metadata?: Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_verified_at?: string | null;
          phone_number_id?: string | null;
          updated_at?: string | null;
          webhook_url?: string | null;
        };
        Update: {
          access_token_encrypted?: string | null;
          api_key_encrypted?: string | null;
          api_secret_encrypted?: string | null;
          business_account_id?: string | null;
          channel?: Database["public"]["Enums"]["channel_type"];
          config_metadata?: Json | null;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          last_verified_at?: string | null;
          phone_number_id?: string | null;
          updated_at?: string | null;
          webhook_url?: string | null;
        };
        Relationships: [];
      };
      chat_shortcuts: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chat_shortcuts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: {
          created_at: string | null;
          customer_id: string | null;
          direction: Database["public"]["Enums"]["message_direction"];
          duration_seconds: number | null;
          employee_id: string | null;
          ended_at: string | null;
          id: string;
          phone_number: string | null;
          recording_url: string | null;
          session_id: string | null;
          started_at: string | null;
          status: string | null;
        };
        Insert: {
          created_at?: string | null;
          customer_id?: string | null;
          direction: Database["public"]["Enums"]["message_direction"];
          duration_seconds?: number | null;
          employee_id?: string | null;
          ended_at?: string | null;
          id?: string;
          phone_number?: string | null;
          recording_url?: string | null;
          session_id?: string | null;
          started_at?: string | null;
          status?: string | null;
        };
        Update: {
          created_at?: string | null;
          customer_id?: string | null;
          direction?: Database["public"]["Enums"]["message_direction"];
          duration_seconds?: number | null;
          employee_id?: string | null;
          ended_at?: string | null;
          id?: string;
          phone_number?: string | null;
          recording_url?: string | null;
          session_id?: string | null;
          started_at?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calls_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          channel_identifier: string | null;
          created_at: string | null;
          email: string | null;
          external_id: string | null;
          id: string;
          metadata: Json | null;
          name: string | null;
          phone: string | null;
          preferred_channel: Database["public"]["Enums"]["channel_type"] | null;
          updated_at: string | null;
        };
        Insert: {
          channel_identifier?: string | null;
          created_at?: string | null;
          email?: string | null;
          external_id?: string | null;
          id?: string;
          metadata?: Json | null;
          name?: string | null;
          phone?: string | null;
          preferred_channel?:
            | Database["public"]["Enums"]["channel_type"]
            | null;
          updated_at?: string | null;
        };
        Update: {
          channel_identifier?: string | null;
          created_at?: string | null;
          email?: string | null;
          external_id?: string | null;
          id?: string;
          metadata?: Json | null;
          name?: string | null;
          phone?: string | null;
          preferred_channel?:
            | Database["public"]["Enums"]["channel_type"]
            | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      employees: {
        Row: {
          assigned_channels:
            | Database["public"]["Enums"]["channel_type"][]
            | null;
          created_at: string | null;
          department: string | null;
          employee_code: string | null;
          id: string;
          is_active: boolean | null;
          performance_score: number | null;
          profile_id: string | null;
          shift_end: string | null;
          shift_start: string | null;
          updated_at: string | null;
        };
        Insert: {
          assigned_channels?:
            | Database["public"]["Enums"]["channel_type"][]
            | null;
          created_at?: string | null;
          department?: string | null;
          employee_code?: string | null;
          id?: string;
          is_active?: boolean | null;
          performance_score?: number | null;
          profile_id?: string | null;
          shift_end?: string | null;
          shift_start?: string | null;
          updated_at?: string | null;
        };
        Update: {
          assigned_channels?:
            | Database["public"]["Enums"]["channel_type"][]
            | null;
          created_at?: string | null;
          department?: string | null;
          employee_code?: string | null;
          id?: string;
          is_active?: boolean | null;
          performance_score?: number | null;
          profile_id?: string | null;
          shift_end?: string | null;
          shift_start?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "employees_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          channel: Database["public"]["Enums"]["channel_type"];
          content: string | null;
          created_at: string | null;
          delivered_at: string | null;
          direction: Database["public"]["Enums"]["message_direction"];
          external_message_id: string | null;
          id: string;
          media_type: string | null;
          media_url: string | null;
          read_at: string | null;
          sent_at: string | null;
          session_id: string | null;
        };
        Insert: {
          channel: Database["public"]["Enums"]["channel_type"];
          content?: string | null;
          created_at?: string | null;
          delivered_at?: string | null;
          direction: Database["public"]["Enums"]["message_direction"];
          external_message_id?: string | null;
          id?: string;
          media_type?: string | null;
          media_url?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          session_id?: string | null;
        };
        Update: {
          channel?: Database["public"]["Enums"]["channel_type"];
          content?: string | null;
          created_at?: string | null;
          delivered_at?: string | null;
          direction?: Database["public"]["Enums"]["message_direction"];
          external_message_id?: string | null;
          id?: string;
          media_type?: string | null;
          media_url?: string | null;
          read_at?: string | null;
          sent_at?: string | null;
          session_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          action_url: string | null;
          created_at: string | null;
          id: string;
          is_read: boolean | null;
          message: string | null;
          title: string;
          type: string | null;
          user_id: string | null;
        };
        Insert: {
          action_url?: string | null;
          created_at?: string | null;
          id?: string;
          is_read?: boolean | null;
          message?: string | null;
          title: string;
          type?: string | null;
          user_id?: string | null;
        };
        Update: {
          action_url?: string | null;
          created_at?: string | null;
          id?: string;
          is_read?: boolean | null;
          message?: string | null;
          title?: string;
          type?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          department: string | null;
          email: string | null;
          first_name: string | null;
          id: string;
          languages: string[] | null;
          last_name: string | null;
          phone: string | null;
          skills: string[] | null;
          status: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          department?: string | null;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          languages?: string[] | null;
          last_name?: string | null;
          phone?: string | null;
          skills?: string[] | null;
          status?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          department?: string | null;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          languages?: string[] | null;
          last_name?: string | null;
          phone?: string | null;
          skills?: string[] | null;
          status?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          channel: Database["public"]["Enums"]["channel_type"];
          created_at: string | null;
          customer_id: string | null;
          duration_seconds: number | null;
          employee_id: string | null;
          ended_at: string | null;
          escalated_to: string | null;
          id: string;
          resolution_notes: string | null;
          satisfaction_score: number | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["session_status"] | null;
          updated_at: string | null;
          wait_time_seconds: number | null;
          main_type_id: string | null;
        };
        Insert: {
          channel: Database["public"]["Enums"]["channel_type"];
          created_at?: string | null;
          customer_id?: string | null;
          duration_seconds?: number | null;
          employee_id?: string | null;
          ended_at?: string | null;
          escalated_to?: string | null;
          id?: string;
          resolution_notes?: string | null;
          satisfaction_score?: number | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["session_status"] | null;
          updated_at?: string | null;
          wait_time_seconds?: number | null;
          main_type_id?: string | null;
        };
        Update: {
          channel?: Database["public"]["Enums"]["channel_type"];
          created_at?: string | null;
          customer_id?: string | null;
          duration_seconds?: number | null;
          employee_id?: string | null;
          ended_at?: string | null;
          escalated_to?: string | null;
          id?: string;
          resolution_notes?: string | null;
          satisfaction_score?: number | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["session_status"] | null;
          updated_at?: string | null;
          wait_time_seconds?: number | null;
          main_type_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_escalated_to_fkey";
            columns: ["escalated_to"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      session_main_types: {
        Row: {
          id: string;
          name: string;
          parent_category: string | null;
          description: string | null;
          color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          parent_category?: string | null;
          description?: string | null;
          color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          parent_category?: string | null;
          description?: string | null;
          color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_elevated_role: { Args: { _user_id: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "supervisor" | "agent" | "viewer";
      channel_type: "whatsapp" | "messenger" | "sms" | "voice" | "email";
      message_direction: "inbound" | "outbound";
      session_status:
        | "active"
        | "waiting"
        | "completed"
        | "escalated"
        | "missed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisor", "agent", "viewer"],
      channel_type: ["whatsapp", "messenger", "sms", "voice", "email"],
      message_direction: ["inbound", "outbound"],
      session_status: ["active", "waiting", "completed", "escalated", "missed"],
    },
  },
} as const;
