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
      admin_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      drivers: {
        Row: {
          approval_status: Database["public"]["Enums"]["driver_approval_status"]
          approved_at: string | null
          birth_date: string | null
          blocked_at: string | null
          category: Database["public"]["Enums"]["ride_category"]
          city: string
          cnh_url: string | null
          cpf: string
          created_at: string
          current_heading: number | null
          current_lat: number | null
          current_lng: number | null
          current_speed: number | null
          email: string
          id: string
          is_online: boolean
          last_location_at: string | null
          motivo_reprovacao: string | null
          name: string
          phone: string
          rating: number
          selfie_url: string | null
          state: string
          subscription_status: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at: string
          user_id: string
          vehicle_color: string
          vehicle_document_url: string | null
          vehicle_model: string
          vehicle_plate: string
          vehicle_year: number
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["driver_approval_status"]
          approved_at?: string | null
          birth_date?: string | null
          blocked_at?: string | null
          category: Database["public"]["Enums"]["ride_category"]
          city: string
          cnh_url?: string | null
          cpf: string
          created_at?: string
          current_heading?: number | null
          current_lat?: number | null
          current_lng?: number | null
          current_speed?: number | null
          email: string
          id?: string
          is_online?: boolean
          last_location_at?: string | null
          motivo_reprovacao?: string | null
          name: string
          phone: string
          rating?: number
          selfie_url?: string | null
          state: string
          subscription_status?: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at?: string
          user_id: string
          vehicle_color: string
          vehicle_document_url?: string | null
          vehicle_model: string
          vehicle_plate: string
          vehicle_year: number
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["driver_approval_status"]
          approved_at?: string | null
          birth_date?: string | null
          blocked_at?: string | null
          category?: Database["public"]["Enums"]["ride_category"]
          city?: string
          cnh_url?: string | null
          cpf?: string
          created_at?: string
          current_heading?: number | null
          current_lat?: number | null
          current_lng?: number | null
          current_speed?: number | null
          email?: string
          id?: string
          is_online?: boolean
          last_location_at?: string | null
          motivo_reprovacao?: string | null
          name?: string
          phone?: string
          rating?: number
          selfie_url?: string | null
          state?: string
          subscription_status?: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at?: string
          user_id?: string
          vehicle_color?: string
          vehicle_document_url?: string | null
          vehicle_model?: string
          vehicle_plate?: string
          vehicle_year?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string | null
          provider_reference: string | null
          ride_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string | null
          provider_reference?: string | null
          ride_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string | null
          provider_reference?: string | null
          ride_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["ride_category"]
          completed_at: string | null
          created_at: string
          current_offer_driver_id: string | null
          destination_lat: number
          destination_lng: number
          destination_name: string
          distance_km: number | null
          driver_id: string | null
          driver_lat: number | null
          driver_lng: number | null
          driver_name: string | null
          driver_phone: string | null
          driver_rating: number | null
          driver_rating_comment: string | null
          driver_vehicle: string | null
          duration_min: number | null
          estimated_price: number | null
          final_price: number | null
          id: string
          origin_lat: number
          origin_lng: number
          origin_name: string
          passenger_id: string
          passenger_rating: number | null
          passenger_rating_comment: string | null
          payment_method: string | null
          rejected_driver_ids: string[]
          started_at: string | null
          status: Database["public"]["Enums"]["ride_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category: Database["public"]["Enums"]["ride_category"]
          completed_at?: string | null
          created_at?: string
          current_offer_driver_id?: string | null
          destination_lat: number
          destination_lng: number
          destination_name: string
          distance_km?: number | null
          driver_id?: string | null
          driver_lat?: number | null
          driver_lng?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_rating?: number | null
          driver_rating_comment?: string | null
          driver_vehicle?: string | null
          duration_min?: number | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          origin_lat: number
          origin_lng: number
          origin_name: string
          passenger_id: string
          passenger_rating?: number | null
          passenger_rating_comment?: string | null
          payment_method?: string | null
          rejected_driver_ids?: string[]
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: Database["public"]["Enums"]["ride_category"]
          completed_at?: string | null
          created_at?: string
          current_offer_driver_id?: string | null
          destination_lat?: number
          destination_lng?: number
          destination_name?: string
          distance_km?: number | null
          driver_id?: string | null
          driver_lat?: number | null
          driver_lng?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_rating?: number | null
          driver_rating_comment?: string | null
          driver_vehicle?: string | null
          duration_min?: number | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          origin_lat?: number
          origin_lng?: number
          origin_name?: string
          passenger_id?: string
          passenger_rating?: number | null
          passenger_rating_comment?: string | null
          payment_method?: string | null
          rejected_driver_ids?: string[]
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          updated_at?: string
        }
        Relationships: []
      }
      sos_alerts: {
        Row: {
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          message: string | null
          resolved_at: string | null
          ride_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          message?: string | null
          resolved_at?: string | null
          ride_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          message?: string | null
          resolved_at?: string | null
          ride_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_alerts_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          created_at: string
          driver_id: string
          id: string
          period_end: string | null
          period_start: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          driver_id: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          driver_id?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "passenger" | "driver" | "admin"
      driver_approval_status:
        | "em_analise"
        | "aprovado"
        | "reprovado"
        | "bloqueado"
      driver_subscription_status: "active" | "inactive" | "overdue"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      ride_category: "carros" | "motos" | "fretes" | "guincho" | "envios"
      ride_status:
        | "procurar_motorista"
        | "motorista_a_caminho"
        | "motorista_chegou"
        | "em_viagem"
        | "finalizada"
        | "cancelada_passageiro"
        | "cancelada_motorista"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["passenger", "driver", "admin"],
      driver_approval_status: [
        "em_analise",
        "aprovado",
        "reprovado",
        "bloqueado",
      ],
      driver_subscription_status: ["active", "inactive", "overdue"],
      payment_status: ["pending", "paid", "failed", "refunded"],
      ride_category: ["carros", "motos", "fretes", "guincho", "envios"],
      ride_status: [
        "procurar_motorista",
        "motorista_a_caminho",
        "motorista_chegou",
        "em_viagem",
        "finalizada",
        "cancelada_passageiro",
        "cancelada_motorista",
      ],
    },
  },
} as const
