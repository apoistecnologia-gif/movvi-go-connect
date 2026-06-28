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
      admin_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          ip: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          ip?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          ip?: string | null
        }
        Relationships: []
      }
      admin_login_history: {
        Row: {
          created_at: string
          email: string | null
          id: string
          ip: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      admin_users_meta: {
        Row: {
          created_at: string
          display_name: string | null
          last_login_at: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          last_login_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          last_login_at?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          category: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          category?: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          category?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      backups: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          file_path: string | null
          id: string
          size_bytes: number | null
          status: string
          tables: Json | null
          type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_path?: string | null
          id?: string
          size_bytes?: number | null
          status?: string
          tables?: Json | null
          type?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_path?: string | null
          id?: string
          size_bytes?: number | null
          status?: string
          tables?: Json | null
          type?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          amount: number
          coupon_id: string
          created_at: string
          id: string
          ride_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          coupon_id: string
          created_at?: string
          id?: string
          ride_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          coupon_id?: string
          created_at?: string
          id?: string
          ride_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          max_discount: number | null
          scope_category: string | null
          type: string
          updated_at: string
          usage_limit: number | null
          used_count: number
          valid_from: string | null
          valid_to: string | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          max_discount?: number | null
          scope_category?: string | null
          type: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string | null
          valid_to?: string | null
          value?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          max_discount?: number | null
          scope_category?: string | null
          type?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string | null
          valid_to?: string | null
          value?: number
        }
        Relationships: []
      }
      driver_public_locations: {
        Row: {
          category: string | null
          current_lat: number | null
          current_lng: number | null
          is_online: boolean
          name: string | null
          photo_url: string | null
          rating: number | null
          updated_at: string
          user_id: string
          vehicle_color: string | null
          vehicle_model: string | null
        }
        Insert: {
          category?: string | null
          current_lat?: number | null
          current_lng?: number | null
          is_online?: boolean
          name?: string | null
          photo_url?: string | null
          rating?: number | null
          updated_at?: string
          user_id: string
          vehicle_color?: string | null
          vehicle_model?: string | null
        }
        Update: {
          category?: string | null
          current_lat?: number | null
          current_lng?: number | null
          is_online?: boolean
          name?: string | null
          photo_url?: string | null
          rating?: number | null
          updated_at?: string
          user_id?: string
          vehicle_color?: string | null
          vehicle_model?: string | null
        }
        Relationships: []
      }
      driver_reports: {
        Row: {
          created_at: string
          details: string | null
          driver_id: string
          id: string
          passenger_id: string
          reason: string
          ride_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          driver_id: string
          id?: string
          passenger_id: string
          reason: string
          ride_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          driver_id?: string
          id?: string
          passenger_id?: string
          reason?: string
          ride_id?: string | null
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
          insurance_url: string | null
          is_online: boolean
          last_location_at: string | null
          motivo_reprovacao: string | null
          name: string
          phone: string
          photo_url: string | null
          rating: number
          selfie_url: string | null
          state: string
          subscription_status: Database["public"]["Enums"]["driver_subscription_status"]
          suspended_at: string | null
          updated_at: string
          user_id: string
          vehicle_color: string
          vehicle_document_url: string | null
          vehicle_model: string
          vehicle_photo_url: string | null
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
          insurance_url?: string | null
          is_online?: boolean
          last_location_at?: string | null
          motivo_reprovacao?: string | null
          name: string
          phone: string
          photo_url?: string | null
          rating?: number
          selfie_url?: string | null
          state: string
          subscription_status?: Database["public"]["Enums"]["driver_subscription_status"]
          suspended_at?: string | null
          updated_at?: string
          user_id: string
          vehicle_color: string
          vehicle_document_url?: string | null
          vehicle_model: string
          vehicle_photo_url?: string | null
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
          insurance_url?: string | null
          is_online?: boolean
          last_location_at?: string | null
          motivo_reprovacao?: string | null
          name?: string
          phone?: string
          photo_url?: string | null
          rating?: number
          selfie_url?: string | null
          state?: string
          subscription_status?: Database["public"]["Enums"]["driver_subscription_status"]
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
          vehicle_color?: string
          vehicle_document_url?: string | null
          vehicle_model?: string
          vehicle_photo_url?: string | null
          vehicle_plate?: string
          vehicle_year?: number
        }
        Relationships: []
      }
      favorite_drivers: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          passenger_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          passenger_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          passenger_id?: string
        }
        Relationships: []
      }
      gps_diagnostics: {
        Row: {
          code: string | null
          created_at: string
          event: string
          extra: Json | null
          id: string
          message: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          event: string
          extra?: Json | null
          id?: string
          message?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          event?: string
          extra?: Json | null
          id?: string
          message?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          channel: string
          created_at: string
          credentials_secret_name: string | null
          display_name: string
          enabled: boolean
          extra: Json
          from_address: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          credentials_secret_name?: string | null
          display_name: string
          enabled?: boolean
          extra?: Json
          from_address?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          credentials_secret_name?: string | null
          display_name?: string
          enabled?: boolean
          extra?: Json
          from_address?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notification_inbox: {
        Row: {
          body: string | null
          category: string
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
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
      notifications_broadcast: {
        Row: {
          audience_filter: Json | null
          audience_type: string
          body: string
          delivery_count: number
          id: string
          sent_at: string
          sent_by: string | null
          title: string
        }
        Insert: {
          audience_filter?: Json | null
          audience_type: string
          body: string
          delivery_count?: number
          id?: string
          sent_at?: string
          sent_by?: string | null
          title: string
        }
        Update: {
          audience_filter?: Json | null
          audience_type?: string
          body?: string
          delivery_count?: number
          id?: string
          sent_at?: string
          sent_by?: string | null
          title?: string
        }
        Relationships: []
      }
      payment_gateways: {
        Row: {
          api_key_secret_name: string | null
          created_at: string
          display_name: string
          enabled: boolean
          extra: Json
          id: string
          mode: string
          pix_key: string | null
          pix_key_type: string | null
          provider: string
          updated_at: string
          updated_by: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key_secret_name?: string | null
          created_at?: string
          display_name: string
          enabled?: boolean
          extra?: Json
          id?: string
          mode?: string
          pix_key?: string | null
          pix_key_type?: string | null
          provider: string
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key_secret_name?: string | null
          created_at?: string
          display_name?: string
          enabled?: boolean
          extra?: Json
          id?: string
          mode?: string
          pix_key?: string | null
          pix_key_type?: string | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string | null
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
      ride_categories: {
        Row: {
          color: string
          created_at: string
          enabled: boolean
          icon: string
          id: string
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          enabled?: boolean
          icon?: string
          id?: string
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          enabled?: boolean
          icon?: string
          id?: string
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      rides: {
        Row: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: Database["public"]["Enums"]["ride_category"]
          completed_at: string | null
          coupon_id: string | null
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
          driver_photo_url: string | null
          driver_rated_at: string | null
          driver_rating: number | null
          driver_rating_comment: string | null
          driver_vehicle: string | null
          duration_min: number | null
          estimated_price: number | null
          fare_breakdown: Json | null
          final_price: number | null
          id: string
          night_multiplier: number
          origin_lat: number
          origin_lng: number
          origin_name: string
          passenger_id: string
          passenger_photo_url: string | null
          passenger_rated_at: string | null
          passenger_rating: number | null
          passenger_rating_comment: string | null
          payment_method: string | null
          rejected_driver_ids: string[]
          route_polyline: string | null
          safety_code: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ride_status"]
          surge_multiplier: number
          updated_at: string
          waypoints: Json | null
        }
        Insert: {
          accepted_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category: Database["public"]["Enums"]["ride_category"]
          completed_at?: string | null
          coupon_id?: string | null
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
          driver_photo_url?: string | null
          driver_rated_at?: string | null
          driver_rating?: number | null
          driver_rating_comment?: string | null
          driver_vehicle?: string | null
          duration_min?: number | null
          estimated_price?: number | null
          fare_breakdown?: Json | null
          final_price?: number | null
          id?: string
          night_multiplier?: number
          origin_lat: number
          origin_lng: number
          origin_name: string
          passenger_id: string
          passenger_photo_url?: string | null
          passenger_rated_at?: string | null
          passenger_rating?: number | null
          passenger_rating_comment?: string | null
          payment_method?: string | null
          rejected_driver_ids?: string[]
          route_polyline?: string | null
          safety_code?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          surge_multiplier?: number
          updated_at?: string
          waypoints?: Json | null
        }
        Update: {
          accepted_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: Database["public"]["Enums"]["ride_category"]
          completed_at?: string | null
          coupon_id?: string | null
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
          driver_photo_url?: string | null
          driver_rated_at?: string | null
          driver_rating?: number | null
          driver_rating_comment?: string | null
          driver_vehicle?: string | null
          duration_min?: number | null
          estimated_price?: number | null
          fare_breakdown?: Json | null
          final_price?: number | null
          id?: string
          night_multiplier?: number
          origin_lat?: number
          origin_lng?: number
          origin_name?: string
          passenger_id?: string
          passenger_photo_url?: string | null
          passenger_rated_at?: string | null
          passenger_rating?: number | null
          passenger_rating_comment?: string | null
          payment_method?: string | null
          rejected_driver_ids?: string[]
          route_polyline?: string | null
          safety_code?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          surge_multiplier?: number
          updated_at?: string
          waypoints?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rides_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      security_settings: {
        Row: {
          audit_logs_enabled: boolean
          id: number
          max_login_attempts: number
          password_policy: Json
          require_2fa: boolean
          session_timeout_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audit_logs_enabled?: boolean
          id?: number
          max_login_attempts?: number
          password_policy?: Json
          require_2fa?: boolean
          session_timeout_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audit_logs_enabled?: boolean
          id?: number
          max_login_attempts?: number
          password_policy?: Json
          require_2fa?: boolean
          session_timeout_minutes?: number
          updated_at?: string
          updated_by?: string | null
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
      subscription_plans: {
        Row: {
          billing_cycle_days: number
          created_at: string
          enabled: boolean
          grace_period_days: number
          id: string
          name: string
          price: number
          promotional_price: number | null
          updated_at: string
        }
        Insert: {
          billing_cycle_days?: number
          created_at?: string
          enabled?: boolean
          grace_period_days?: number
          id?: string
          name: string
          price: number
          promotional_price?: number | null
          updated_at?: string
        }
        Update: {
          billing_cycle_days?: number
          created_at?: string
          enabled?: boolean
          grace_period_days?: number
          id?: string
          name?: string
          price?: number
          promotional_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number
          auto_suspend: boolean
          created_at: string
          driver_id: string
          grace_until: string | null
          id: string
          period_end: string | null
          period_start: string | null
          plan_id: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          auto_suspend?: boolean
          created_at?: string
          driver_id: string
          grace_until?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_suspend?: boolean
          created_at?: string
          driver_id?: string
          grace_until?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          ride_id: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          id?: string
          ride_id?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          ride_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tariff_rules: {
        Row: {
          category_key: string
          created_at: string
          field_key: string
          id: string
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          category_key: string
          created_at?: string
          field_key: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Update: {
          category_key?: string
          created_at?: string
          field_key?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "tariff_rules_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "ride_categories"
            referencedColumns: ["key"]
          },
        ]
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
          avatar_url: string | null
          birth_date: string | null
          block_reason: string | null
          blocked_at: string | null
          city: string | null
          cpf: string | null
          created_at: string
          deleted_at: string | null
          email: string
          email_verified_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gender: string | null
          id: string
          last_login_at: string | null
          name: string
          phone: string | null
          phone_verified_at: string | null
          preferences: Json
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          birth_date?: string | null
          block_reason?: string | null
          blocked_at?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          email_verified_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          id?: string
          last_login_at?: string | null
          name: string
          phone?: string | null
          phone_verified_at?: string | null
          preferences?: Json
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          birth_date?: string | null
          block_reason?: string | null
          blocked_at?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          email_verified_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          id?: string
          last_login_at?: string | null
          name?: string
          phone?: string | null
          phone_verified_at?: string | null
          preferences?: Json
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_suspend_overdue_subscriptions: { Args: never; Returns: undefined }
      get_passenger_stats: {
        Args: { _user_id: string }
        Returns: {
          avg_rating: number
          cancelled_rides: number
          completed_rides: number
          total_rides: number
          total_spent: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "passenger"
        | "driver"
        | "admin"
        | "super_admin"
        | "financial"
        | "support"
        | "operations"
        | "readonly"
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
      app_role: [
        "passenger",
        "driver",
        "admin",
        "super_admin",
        "financial",
        "support",
        "operations",
        "readonly",
      ],
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
