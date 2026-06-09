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
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          is_secret: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          is_secret?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          is_secret?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          max_discount_usd: number | null
          max_uses: number | null
          max_uses_per_user: number
          min_order_usd: number
          starts_at: string | null
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          uses_count: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          max_discount_usd?: number | null
          max_uses?: number | null
          max_uses_per_user?: number
          min_order_usd?: number
          starts_at?: string | null
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          uses_count?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          max_discount_usd?: number | null
          max_uses?: number | null
          max_uses_per_user?: number
          min_order_usd?: number
          starts_at?: string | null
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          uses_count?: number
          value?: number
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          failure_reason: string | null
          id: string
          order_id: string
          picked_up_at: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          proof_photo_url: string | null
          rider_fee_usd: number
          rider_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          failure_reason?: string | null
          id?: string
          order_id: string
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          proof_photo_url?: string | null
          rider_fee_usd?: number
          rider_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          failure_reason?: string | null
          id?: string
          order_id?: string
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          proof_photo_url?: string | null
          rider_fee_usd?: number
          rider_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          error: string | null
          id: string
          order_id: string | null
          payload: Json
          read_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          to_phone: string | null
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          order_id?: string | null
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          to_phone?: string | null
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          error?: string | null
          id?: string
          order_id?: string | null
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          to_phone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total_usd: number
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price_usd: number
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_usd: number
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          unit_price_usd: number
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          line_total_usd?: number
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price_usd?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          code: string | null
          coupon_code: string | null
          created_at: string
          customer_address: string
          customer_id: string | null
          customer_lat: number | null
          customer_lng: number | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string
          delivery_fee: number
          discount_usd: number
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          product_id: string | null
          quantity: number
          rider_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_usd: number
          total_usd: number
          updated_at: string
          vendor_id: string | null
          zone: string
          zone_id: string | null
        }
        Insert: {
          code?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_address: string
          customer_id?: string | null
          customer_lat?: number | null
          customer_lng?: number | null
          customer_name: string
          customer_notes?: string | null
          customer_phone: string
          delivery_fee?: number
          discount_usd?: number
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          product_id?: string | null
          quantity?: number
          rider_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_usd?: number
          total_usd: number
          updated_at?: string
          vendor_id?: string | null
          zone: string
          zone_id?: string | null
        }
        Update: {
          code?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_address?: string
          customer_id?: string | null
          customer_lat?: number | null
          customer_lng?: number | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string
          delivery_fee?: number
          discount_usd?: number
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          product_id?: string | null
          quantity?: number
          rider_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_usd?: number
          total_usd?: number
          updated_at?: string
          vendor_id?: string | null
          zone?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_usd: number
          collected_at: string | null
          collected_by: string | null
          created_at: string
          currency: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          phone: string | null
          provider: string | null
          provider_ref: string | null
          provider_status: string | null
          raw: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_usd: number
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          phone?: string | null
          provider?: string | null
          provider_ref?: string | null
          provider_status?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_usd?: number
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          phone?: string | null
          provider?: string | null
          provider_ref?: string | null
          provider_status?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_subcategories: {
        Row: {
          active: boolean
          created_at: string
          emoji: string | null
          id: string
          name: string
          parent_category: Database["public"]["Enums"]["product_category"]
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          emoji?: string | null
          id?: string
          name: string
          parent_category: Database["public"]["Enums"]["product_category"]
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          emoji?: string | null
          id?: string
          name?: string
          parent_category?: Database["public"]["Enums"]["product_category"]
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          approved: boolean
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          image_url: string | null
          images: string[]
          name: string
          price_usd: number
          rating_avg: number
          rating_count: number
          slug: string | null
          stock: number
          subcategory_id: string | null
          unit: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          approved?: boolean
          category: Database["public"]["Enums"]["product_category"]
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          name: string
          price_usd: number
          rating_avg?: number
          rating_count?: number
          slug?: string | null
          stock?: number
          subcategory_id?: string | null
          unit?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          approved?: boolean
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          name?: string
          price_usd?: number
          rating_avg?: number
          rating_count?: number
          slug?: string | null
          stock?: number
          subcategory_id?: string | null
          unit?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "product_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          callmebot_apikey: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          preferred_lang: string
          updated_at: string
          whatsapp_verified: boolean
          zone: string | null
        }
        Insert: {
          avatar_url?: string | null
          callmebot_apikey?: string | null
          created_at?: string
          id: string
          name?: string
          phone?: string | null
          preferred_lang?: string
          updated_at?: string
          whatsapp_verified?: boolean
          zone?: string | null
        }
        Update: {
          avatar_url?: string | null
          callmebot_apikey?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          preferred_lang?: string
          updated_at?: string
          whatsapp_verified?: boolean
          zone?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          resolution_note: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolution_note?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target"]
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author_id: string
          comment: string | null
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          rating: number
          rider_id: string | null
          target: Database["public"]["Enums"]["review_target"]
          vendor_id: string | null
        }
        Insert: {
          author_id: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          rating: number
          rider_id?: string | null
          target: Database["public"]["Enums"]["review_target"]
          vendor_id?: string | null
        }
        Update: {
          author_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          rating?: number
          rider_id?: string | null
          target?: Database["public"]["Enums"]["review_target"]
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_zones: {
        Row: {
          rider_id: string
          zone_id: string
        }
        Insert: {
          rider_id: string
          zone_id: string
        }
        Update: {
          rider_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_zones_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          callmebot_apikey: string | null
          created_at: string
          current_lat: number | null
          current_lng: number | null
          full_name: string
          id: string
          id_document_url: string | null
          is_available: boolean
          rating_avg: number
          rating_count: number
          status: Database["public"]["Enums"]["rider_status"]
          total_deliveries: number
          total_earnings_usd: number
          updated_at: string
          user_id: string
          vehicle: Database["public"]["Enums"]["rider_vehicle"]
          whatsapp: string
        }
        Insert: {
          callmebot_apikey?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          full_name: string
          id?: string
          id_document_url?: string | null
          is_available?: boolean
          rating_avg?: number
          rating_count?: number
          status?: Database["public"]["Enums"]["rider_status"]
          total_deliveries?: number
          total_earnings_usd?: number
          updated_at?: string
          user_id: string
          vehicle?: Database["public"]["Enums"]["rider_vehicle"]
          whatsapp: string
        }
        Update: {
          callmebot_apikey?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          full_name?: string
          id?: string
          id_document_url?: string | null
          is_available?: boolean
          rating_avg?: number
          rating_count?: number
          status?: Database["public"]["Enums"]["rider_status"]
          total_deliveries?: number
          total_earnings_usd?: number
          updated_at?: string
          user_id?: string
          vehicle?: Database["public"]["Enums"]["rider_vehicle"]
          whatsapp?: string
        }
        Relationships: []
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
      vendor_zones: {
        Row: {
          vendor_id: string
          zone_id: string
        }
        Insert: {
          vendor_id: string
          zone_id: string
        }
        Update: {
          vendor_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_zones_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_zones_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          base_zone_id: string | null
          callmebot_apikey: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          mobile_money_name: string | null
          mobile_money_number: string | null
          id: string
          logo_url: string | null
          owner_id: string
          rating_avg: number
          rating_count: number
          shop_name: string
          slug: string
          status: Database["public"]["Enums"]["vendor_status"]
          updated_at: string
          whatsapp: string
        }
        Insert: {
          base_zone_id?: string | null
          callmebot_apikey?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          owner_id: string
          rating_avg?: number
          rating_count?: number
          shop_name: string
          slug: string
          status?: Database["public"]["Enums"]["vendor_status"]
          updated_at?: string
          whatsapp: string
        }
        Update: {
          base_zone_id?: string | null
          callmebot_apikey?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          mobile_money_name?: string | null
          mobile_money_number?: string | null
          owner_id?: string
          rating_avg?: number
          rating_count?: number
          shop_name?: string
          slug?: string
          status?: Database["public"]["Enums"]["vendor_status"]
          updated_at?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_base_zone_id_fkey"
            columns: ["base_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          active: boolean
          created_at: string
          delivery_fee_usd: number
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          delivery_fee_usd?: number
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          delivery_fee_usd?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      vendors_public: {
        Row: {
          base_zone_id: string | null
          cover_url: string | null
          created_at: string | null
          description: string | null
          id: string | null
          logo_url: string | null
          owner_id: string | null
          rating_avg: number | null
          rating_count: number | null
          shop_name: string | null
          slug: string | null
          status: Database["public"]["Enums"]["vendor_status"] | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          base_zone_id?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          owner_id?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          shop_name?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["vendor_status"] | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          base_zone_id?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          owner_id?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          shop_name?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["vendor_status"] | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_base_zone_id_fkey"
            columns: ["base_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
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
      app_role: "customer" | "vendor" | "rider" | "admin"
      coupon_type: "fixed" | "percent"
      delivery_status:
        | "assigned"
        | "picked_up"
        | "in_transit"
        | "delivered"
        | "failed"
      notification_channel: "whatsapp" | "sms" | "in_app"
      notification_status: "queued" | "sent" | "delivered" | "failed"
      order_status:
        | "pending"
        | "confirmed"
        | "ready"
        | "picked_up"
        | "delivered"
        | "cancelled"
      payment_method: "cash" | "mpesa" | "airtel_money" | "orange_money"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      product_category:
        | "phone_accessories"
        | "local_food"
        | "delivery_service"
        | "home_tools"
        | "beauty"
        | "jewelry"
        | "watches"
        | "computers"
        | "electronics"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
      report_target: "product" | "vendor" | "rider" | "order"
      review_target: "product" | "vendor" | "rider"
      rider_status: "pending" | "active" | "offline" | "suspended"
      rider_vehicle: "moto" | "velo" | "pied" | "voiture"
      vendor_status: "pending" | "approved" | "suspended" | "rejected"
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
      app_role: ["customer", "vendor", "rider", "admin"],
      coupon_type: ["fixed", "percent"],
      delivery_status: [
        "assigned",
        "picked_up",
        "in_transit",
        "delivered",
        "failed",
      ],
      notification_channel: ["whatsapp", "sms", "in_app"],
      notification_status: ["queued", "sent", "delivered", "failed"],
      order_status: [
        "pending",
        "confirmed",
        "ready",
        "picked_up",
        "delivered",
        "cancelled",
      ],
      payment_method: ["cash", "mpesa", "airtel_money", "orange_money"],
      payment_status: ["pending", "paid", "failed", "refunded"],
      product_category: [
        "phone_accessories",
        "local_food",
        "delivery_service",
        "home_tools",
        "beauty",
        "jewelry",
        "watches",
        "computers",
        "electronics",
      ],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      report_target: ["product", "vendor", "rider", "order"],
      review_target: ["product", "vendor", "rider"],
      rider_status: ["pending", "active", "offline", "suspended"],
      rider_vehicle: ["moto", "velo", "pied", "voiture"],
      vendor_status: ["pending", "approved", "suspended", "rejected"],
    },
  },
} as const
