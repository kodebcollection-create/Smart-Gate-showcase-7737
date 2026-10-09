export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      gate_events: {
        Row: {
          created_at: string
          direction: string
          guard_id: string
          id: string
          laptop_id: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          guard_id: string
          id?: string
          laptop_id: string
          owner_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          guard_id?: string
          id?: string
          laptop_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_events_laptop_id_fkey"
            columns: ["laptop_id"]
            isOneToOne: false
            referencedRelation: "laptops"
            referencedColumns: ["id"]
          },
        ]
      }
      laptop_transfers: {
        Row: {
          from_owner: string
          id: string
          laptop_id: string
          to_owner: string
          transferred_at: string
          transferred_by: string
        }
        Insert: {
          from_owner: string
          id?: string
          laptop_id: string
          to_owner: string
          transferred_at?: string
          transferred_by: string
        }
        Update: {
          from_owner?: string
          id?: string
          laptop_id?: string
          to_owner?: string
          transferred_at?: string
          transferred_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "laptop_transfers_laptop_id_fkey"
            columns: ["laptop_id"]
            isOneToOne: false
            referencedRelation: "laptops"
            referencedColumns: ["id"]
          },
        ]
      }
      laptops: {
        Row: {
          deregistered_at: string | null
          id: string
          laptop_photo_path: string
          model: string | null
          on_campus: boolean
          owner_id: string
          registered_at: string
          secret_qr_id: string
          serial_number: string
          status: Database["public"]["Enums"]["laptop_status"]
          updated_at: string
        }
        Insert: {
          deregistered_at?: string | null
          id?: string
          laptop_photo_path: string
          model?: string | null
          on_campus?: boolean
          owner_id: string
          registered_at?: string
          secret_qr_id?: string
          serial_number: string
          status?: Database["public"]["Enums"]["laptop_status"]
          updated_at?: string
        }
        Update: {
          deregistered_at?: string | null
          id?: string
          laptop_photo_path?: string
          model?: string | null
          on_campus?: boolean
          owner_id?: string
          registered_at?: string
          secret_qr_id?: string
          serial_number?: string
          status?: Database["public"]["Enums"]["laptop_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "laptops_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_report_events: {
        Row: {
          created_at: string
          created_by: string
          id: string
          laptop_id: string
          note: string | null
          owner_id: string
          stage: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          laptop_id: string
          note?: string | null
          owner_id: string
          stage: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          laptop_id?: string
          note?: string | null
          owner_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_report_events_laptop_id_fkey"
            columns: ["laptop_id"]
            isOneToOne: false
            referencedRelation: "laptops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          photo_path: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          photo_path?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          photo_path?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      scan_logs: {
        Row: {
          id: string
          laptop_id: string | null
          result: string
          scanned_at: string
          scanned_by: string | null
          scanned_value: string
        }
        Insert: {
          id?: string
          laptop_id?: string | null
          result: string
          scanned_at?: string
          scanned_by?: string | null
          scanned_value: string
        }
        Update: {
          id?: string
          laptop_id?: string | null
          result?: string
          scanned_at?: string
          scanned_by?: string | null
          scanned_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_logs_laptop_id_fkey"
            columns: ["laptop_id"]
            isOneToOne: false
            referencedRelation: "laptops"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_lost_update: {
        Args: { _laptop_id: string; _note: string; _stage: string }
        Returns: undefined
      }
      claim_staff_role: { Args: never; Returns: boolean }
      claim_student_role: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_laptop: {
        Args: { _token: string }
        Returns: {
          full_name: string
          laptop_id: string
          laptop_photo_path: string
          model: string
          on_campus: boolean
          other_on_campus: boolean
          owner_id: string
          owner_photo_path: string
          serial_number: string
          status: Database["public"]["Enums"]["laptop_status"]
          username: string
        }[]
      }
      record_gate_event: {
        Args: { _direction: string; _laptop_id: string }
        Returns: string
      }
      record_gate_event_at: {
        Args: { _at: string; _direction: string; _laptop_id: string }
        Returns: string
      }
      register_laptop: {
        Args: { _model: string; _photo_path: string; _serial: string }
        Returns: string
      }
      report_laptop_lost: {
        Args: { _laptop_id: string; _lost: boolean }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          _email: string
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      transfer_laptop: {
        Args: { _laptop_id: string; _username: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "student" | "guard" | "admin"
      laptop_status: "active" | "lost" | "stolen" | "transferred"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["student", "guard", "admin"],
      laptop_status: ["active", "lost", "stolen", "transferred"],
    },
  },
} as const
