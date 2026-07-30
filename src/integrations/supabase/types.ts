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
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      bon_commande_lignes: {
        Row: {
          bon_commande_id: string
          id: string
          nom_produit: string | null
          prix_achat_unitaire_usd: number
          produit_id: string | null
          quantite_commandee: number
          quantite_recue: number
        }
        Insert: {
          bon_commande_id: string
          id?: string
          nom_produit?: string | null
          prix_achat_unitaire_usd: number
          produit_id?: string | null
          quantite_commandee: number
          quantite_recue?: number
        }
        Update: {
          bon_commande_id?: string
          id?: string
          nom_produit?: string | null
          prix_achat_unitaire_usd?: number
          produit_id?: string | null
          quantite_commandee?: number
          quantite_recue?: number
        }
        Relationships: [
          {
            foreignKeyName: "bon_commande_lignes_bon_commande_id_fkey"
            columns: ["bon_commande_id"]
            isOneToOne: false
            referencedRelation: "bons_commande_fournisseur"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bon_commande_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      bons_commande_fournisseur: {
        Row: {
          boutique_id: string
          created_at: string
          created_by: string | null
          date_commande: string | null
          date_reception: string | null
          fournisseur_id: string
          id: string
          numero: string | null
          statut: string
          updated_at: string
        }
        Insert: {
          boutique_id: string
          created_at?: string
          created_by?: string | null
          date_commande?: string | null
          date_reception?: string | null
          fournisseur_id: string
          id?: string
          numero?: string | null
          statut?: string
          updated_at?: string
        }
        Update: {
          boutique_id?: string
          created_at?: string
          created_by?: string | null
          date_commande?: string | null
          date_reception?: string | null
          fournisseur_id?: string
          id?: string
          numero?: string | null
          statut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bons_commande_fournisseur_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_commande_fournisseur_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
        ]
      }
      boutique_categories: {
        Row: {
          actif: boolean
          boutique_id: string
          created_at: string
          icone: string | null
          id: string
          nom: string
        }
        Insert: {
          actif?: boolean
          boutique_id: string
          created_at?: string
          icone?: string | null
          id?: string
          nom: string
        }
        Update: {
          actif?: boolean
          boutique_id?: string
          created_at?: string
          icone?: string | null
          id?: string
          nom?: string
        }
        Relationships: [
          {
            foreignKeyName: "boutique_categories_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      boutique_compteurs: {
        Row: {
          boutique_id: string
          prochain_numero_bon_commande: number
          prochain_numero_commande: number
          prochain_numero_facture: number
          prochain_numero_vente: number
        }
        Insert: {
          boutique_id: string
          prochain_numero_bon_commande?: number
          prochain_numero_commande?: number
          prochain_numero_facture?: number
          prochain_numero_vente?: number
        }
        Update: {
          boutique_id?: string
          prochain_numero_bon_commande?: number
          prochain_numero_commande?: number
          prochain_numero_facture?: number
          prochain_numero_vente?: number
        }
        Relationships: [
          {
            foreignKeyName: "boutique_compteurs_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: true
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      boutique_integration_settings: {
        Row: {
          boutique_id: string
          is_secret: boolean
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          boutique_id: string
          is_secret?: boolean
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          boutique_id?: string
          is_secret?: boolean
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boutique_integration_settings_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      boutique_users: {
        Row: {
          boutique_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["boutique_role"]
          user_id: string
        }
        Insert: {
          boutique_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["boutique_role"]
          user_id: string
        }
        Update: {
          boutique_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["boutique_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boutique_users_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      boutiques: {
        Row: {
          actif: boolean
          adresse: string | null
          created_at: string
          devise: string
          domaine: string | null
          email: string | null
          id: string
          id_national: string | null
          logo_url: string | null
          nom: string
          rccm: string | null
          slug: string
          telephone: string | null
          theme: Json
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          created_at?: string
          devise?: string
          domaine?: string | null
          email?: string | null
          id?: string
          id_national?: string | null
          logo_url?: string | null
          nom: string
          rccm?: string | null
          slug: string
          telephone?: string | null
          theme?: Json
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          created_at?: string
          devise?: string
          domaine?: string | null
          email?: string | null
          id?: string
          id_national?: string | null
          logo_url?: string | null
          nom?: string
          rccm?: string | null
          slug?: string
          telephone?: string | null
          theme?: Json
          updated_at?: string
        }
        Relationships: []
      }
      carts: {
        Row: {
          items: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          items?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          items?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      clients_boutique: {
        Row: {
          adresse_defaut: string | null
          boutique_id: string
          created_at: string
          email: string | null
          id: string
          nom: string
          telephone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          adresse_defaut?: string | null
          boutique_id: string
          created_at?: string
          email?: string | null
          id?: string
          nom: string
          telephone: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          adresse_defaut?: string | null
          boutique_id?: string
          created_at?: string
          email?: string | null
          id?: string
          nom?: string
          telephone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_boutique_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      codes_promo: {
        Row: {
          actif: boolean
          boutique_id: string
          code: string
          created_at: string
          date_debut: string | null
          date_fin: string | null
          id: string
          montant_min_usd: number
          type_reduction: Database["public"]["Enums"]["boutique_promo_type"]
          updated_at: string
          usage_actuel: number
          usage_max: number | null
          valeur: number
        }
        Insert: {
          actif?: boolean
          boutique_id: string
          code: string
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          montant_min_usd?: number
          type_reduction: Database["public"]["Enums"]["boutique_promo_type"]
          updated_at?: string
          usage_actuel?: number
          usage_max?: number | null
          valeur: number
        }
        Update: {
          actif?: boolean
          boutique_id?: string
          code?: string
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          montant_min_usd?: number
          type_reduction?: Database["public"]["Enums"]["boutique_promo_type"]
          updated_at?: string
          usage_actuel?: number
          usage_max?: number | null
          valeur?: number
        }
        Relationships: [
          {
            foreignKeyName: "codes_promo_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
      }
      commande_lignes: {
        Row: {
          commande_id: string
          id: string
          prix_unitaire_usd: number
          produit_id: string
          quantite: number
          total_ligne_usd: number
        }
        Insert: {
          commande_id: string
          id?: string
          prix_unitaire_usd: number
          produit_id: string
          quantite: number
          total_ligne_usd: number
        }
        Update: {
          commande_id?: string
          id?: string
          prix_unitaire_usd?: number
          produit_id?: string
          quantite?: number
          total_ligne_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "commande_lignes_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes_ecommerce"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commande_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      commandes_ecommerce: {
        Row: {
          adresse_livraison: string
          boutique_id: string
          client_id: string
          code_promo_id: string | null
          created_at: string
          frais_livraison_usd: number
          id: string
          mode_paiement: string
          numero: string | null
          remise_usd: number
          sous_total_usd: number
          statut: string
          total_usd: number
          updated_at: string
          vente_id: string | null
        }
        Insert: {
          adresse_livraison: string
          boutique_id: string
          client_id: string
          code_promo_id?: string | null
          created_at?: string
          frais_livraison_usd?: number
          id?: string
          mode_paiement: string
          numero?: string | null
          remise_usd?: number
          sous_total_usd: number
          statut?: string
          total_usd: number
          updated_at?: string
          vente_id?: string | null
        }
        Update: {
          adresse_livraison?: string
          boutique_id?: string
          client_id?: string
          code_promo_id?: string | null
          created_at?: string
          frais_livraison_usd?: number
          id?: string
          mode_paiement?: string
          numero?: string | null
          remise_usd?: number
          sous_total_usd?: number
          statut?: string
          total_usd?: number
          updated_at?: string
          vente_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commandes_ecommerce_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_ecommerce_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_boutique"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_ecommerce_code_promo_id_fkey"
            columns: ["code_promo_id"]
            isOneToOne: false
            referencedRelation: "codes_promo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_ecommerce_vente_id_fkey"
            columns: ["vente_id"]
            isOneToOne: false
            referencedRelation: "ventes"
            referencedColumns: ["id"]
          },
        ]
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
      credit_paiements: {
        Row: {
          boutique_id: string
          created_at: string
          credit_id: string
          encaisse_par: string | null
          id: string
          mode_paiement: string
          montant_usd: number
          note: string | null
        }
        Insert: {
          boutique_id: string
          created_at?: string
          credit_id: string
          encaisse_par?: string | null
          id?: string
          mode_paiement?: string
          montant_usd: number
          note?: string | null
        }
        Update: {
          boutique_id?: string
          created_at?: string
          credit_id?: string
          encaisse_par?: string | null
          id?: string
          mode_paiement?: string
          montant_usd?: number
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_paiements_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_paiements_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
            referencedColumns: ["id"]
          },
        ]
      }
      credits: {
        Row: {
          boutique_id: string
          client_id: string
          created_at: string
          date_echeance: string
          id: string
          montant_paye_usd: number
          montant_total_usd: number
          statut: string
          vente_id: string
        }
        Insert: {
          boutique_id: string
          client_id: string
          created_at?: string
          date_echeance: string
          id?: string
          montant_paye_usd?: number
          montant_total_usd: number
          statut?: string
          vente_id: string
        }
        Update: {
          boutique_id?: string
          client_id?: string
          created_at?: string
          date_echeance?: string
          id?: string
          montant_paye_usd?: number
          montant_total_usd?: number
          statut?: string
          vente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_boutique"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_vente_id_fkey"
            columns: ["vente_id"]
            isOneToOne: true
            referencedRelation: "ventes"
            referencedColumns: ["id"]
          },
        ]
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
      factures: {
        Row: {
          boutique_id: string
          created_at: string
          id: string
          numero: string | null
          pdf_url: string | null
          vente_id: string
        }
        Insert: {
          boutique_id: string
          created_at?: string
          id?: string
          numero?: string | null
          pdf_url?: string | null
          vente_id: string
        }
        Update: {
          boutique_id?: string
          created_at?: string
          id?: string
          numero?: string | null
          pdf_url?: string | null
          vente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factures_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_vente_id_fkey"
            columns: ["vente_id"]
            isOneToOne: true
            referencedRelation: "ventes"
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
      fournisseurs: {
        Row: {
          actif: boolean
          adresse: string | null
          boutique_id: string
          contact: string | null
          created_at: string
          id: string
          nom: string
          telephone: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          boutique_id: string
          contact?: string | null
          created_at?: string
          id?: string
          nom: string
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          boutique_id?: string
          contact?: string | null
          created_at?: string
          id?: string
          nom?: string
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fournisseurs_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
        ]
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
      livraisons: {
        Row: {
          boutique_id: string
          commande_id: string
          coursier_id: string | null
          coursier_nom: string | null
          created_at: string
          date_livraison: string | null
          date_prise_en_charge: string | null
          id: string
          mode_livraison: string
          rider_id: string | null
          statut_livraison: string
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          boutique_id: string
          commande_id: string
          coursier_id?: string | null
          coursier_nom?: string | null
          created_at?: string
          date_livraison?: string | null
          date_prise_en_charge?: string | null
          id?: string
          mode_livraison?: string
          rider_id?: string | null
          statut_livraison?: string
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          boutique_id?: string
          commande_id?: string
          coursier_id?: string | null
          coursier_nom?: string | null
          created_at?: string
          date_livraison?: string | null
          date_prise_en_charge?: string | null
          id?: string
          mode_livraison?: string
          rider_id?: string | null
          statut_livraison?: string
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "livraisons_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "livraisons_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: true
            referencedRelation: "commandes_ecommerce"
            referencedColumns: ["id"]
          },
        ]
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
      panier: {
        Row: {
          boutique_id: string
          client_id: string | null
          created_at: string
          id: string
          produit_id: string
          quantite: number
          session_id: string | null
          updated_at: string
        }
        Insert: {
          boutique_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          produit_id: string
          quantite: number
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          boutique_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          produit_id?: string
          quantite?: number
          session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "panier_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panier_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_boutique"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panier_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
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
          category_id: string
          created_at: string
          emoji: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          emoji?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          emoji?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          approved: boolean
          created_at: string
          description: string | null
          emoji: string | null
          id: string
          image_url: string | null
          images: string[]
          name: string
          price_usd: number
          promo_active: boolean
          promo_approved: boolean
          promo_ends_at: string | null
          promo_price_usd: number | null
          promo_starts_at: string | null
          rating_avg: number
          rating_count: number
          slug: string | null
          stock: number
          subcategory_id: string
          unit: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          name: string
          price_usd: number
          promo_active?: boolean
          promo_approved?: boolean
          promo_ends_at?: string | null
          promo_price_usd?: number | null
          promo_starts_at?: string | null
          rating_avg?: number
          rating_count?: number
          slug?: string | null
          stock?: number
          subcategory_id: string
          unit?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string
          description?: string | null
          emoji?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          name?: string
          price_usd?: number
          promo_active?: boolean
          promo_approved?: boolean
          promo_ends_at?: string | null
          promo_price_usd?: number | null
          promo_starts_at?: string | null
          rating_avg?: number
          rating_count?: number
          slug?: string | null
          stock?: number
          subcategory_id?: string
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
      produits: {
        Row: {
          actif: boolean
          boutique_id: string
          categorie_id: string
          couleur: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          images: string[]
          nom: string
          prix_achat_usd: number | null
          prix_promo_usd: number | null
          prix_usd: number
          promo_actif: boolean
          promo_debut: string | null
          promo_fin: string | null
          qr_code_data: string | null
          qr_code_url: string | null
          quantite: number
          seuil_alerte: number
          sous_categorie_id: string | null
          stock_bas: boolean | null
          taille: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          boutique_id: string
          categorie_id: string
          couleur?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          nom: string
          prix_achat_usd?: number | null
          prix_promo_usd?: number | null
          prix_usd: number
          promo_actif?: boolean
          promo_debut?: string | null
          promo_fin?: string | null
          qr_code_data?: string | null
          qr_code_url?: string | null
          quantite?: number
          seuil_alerte?: number
          sous_categorie_id?: string | null
          stock_bas?: boolean | null
          taille?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          boutique_id?: string
          categorie_id?: string
          couleur?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          nom?: string
          prix_achat_usd?: number | null
          prix_promo_usd?: number | null
          prix_usd?: number
          promo_actif?: boolean
          promo_debut?: string | null
          promo_fin?: string | null
          qr_code_data?: string | null
          qr_code_url?: string | null
          quantite?: number
          seuil_alerte?: number
          sous_categorie_id?: string | null
          stock_bas?: boolean | null
          taille?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produits_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_categorie_id_fkey"
            columns: ["categorie_id"]
            isOneToOne: false
            referencedRelation: "boutique_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_sous_categorie_id_fkey"
            columns: ["sous_categorie_id"]
            isOneToOne: false
            referencedRelation: "sous_categories"
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
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          qualified_at: string | null
          qualifying_order_id: string | null
          referred_id: string
          referrer_id: string
          reward_referred_usd: number
          reward_referrer_usd: number
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          qualified_at?: string | null
          qualifying_order_id?: string | null
          referred_id: string
          referrer_id: string
          reward_referred_usd?: number
          reward_referrer_usd?: number
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          qualified_at?: string | null
          qualifying_order_id?: string | null
          referred_id?: string
          referrer_id?: string
          reward_referred_usd?: number
          reward_referrer_usd?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_qualifying_order_id_fkey"
            columns: ["qualifying_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      saved_addresses: {
        Row: {
          address: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          landmark: string | null
          lat: number | null
          lng: number | null
          updated_at: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          updated_at?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          updated_at?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_addresses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      sous_categories: {
        Row: {
          actif: boolean
          boutique_id: string
          categorie_id: string
          created_at: string
          id: string
          nom: string
        }
        Insert: {
          actif?: boolean
          boutique_id: string
          categorie_id: string
          created_at?: string
          id?: string
          nom: string
        }
        Update: {
          actif?: boolean
          boutique_id?: string
          categorie_id?: string
          created_at?: string
          id?: string
          nom?: string
        }
        Relationships: [
          {
            foreignKeyName: "sous_categories_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sous_categories_categorie_id_fkey"
            columns: ["categorie_id"]
            isOneToOne: false
            referencedRelation: "boutique_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          boutique_id: string
          created_at: string
          created_by: string | null
          id: string
          motif: string | null
          produit_id: string
          quantite: number
          quantite_apres: number
          reference_id: string | null
          reference_type: string | null
          type_mouvement: string
        }
        Insert: {
          boutique_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          motif?: string | null
          produit_id: string
          quantite: number
          quantite_apres: number
          reference_id?: string | null
          reference_type?: string | null
          type_mouvement: string
        }
        Update: {
          boutique_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          motif?: string | null
          produit_id?: string
          quantite?: number
          quantite_apres?: number
          reference_id?: string | null
          reference_type?: string | null
          type_mouvement?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
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
          id: string
          logo_url: string | null
          mobile_money_name: string | null
          mobile_money_number: string | null
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
      vente_lignes: {
        Row: {
          id: string
          prix_unitaire_usd: number
          produit_id: string
          quantite: number
          total_ligne_usd: number
          vente_id: string
        }
        Insert: {
          id?: string
          prix_unitaire_usd: number
          produit_id: string
          quantite: number
          total_ligne_usd: number
          vente_id: string
        }
        Update: {
          id?: string
          prix_unitaire_usd?: number
          produit_id?: string
          quantite?: number
          total_ligne_usd?: number
          vente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vente_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vente_lignes_vente_id_fkey"
            columns: ["vente_id"]
            isOneToOne: false
            referencedRelation: "ventes"
            referencedColumns: ["id"]
          },
        ]
      }
      ventes: {
        Row: {
          boutique_id: string
          caissier_id: string | null
          canal: string
          client_id: string | null
          code_promo_id: string | null
          created_at: string
          hors_ligne_id: string | null
          id: string
          mode_paiement: string
          numero: string | null
          remise_usd: number
          sous_total_usd: number
          statut: string
          total_usd: number
        }
        Insert: {
          boutique_id: string
          caissier_id?: string | null
          canal?: string
          client_id?: string | null
          code_promo_id?: string | null
          created_at?: string
          hors_ligne_id?: string | null
          id?: string
          mode_paiement: string
          numero?: string | null
          remise_usd?: number
          sous_total_usd?: number
          statut?: string
          total_usd: number
        }
        Update: {
          boutique_id?: string
          caissier_id?: string | null
          canal?: string
          client_id?: string | null
          code_promo_id?: string | null
          created_at?: string
          hors_ligne_id?: string | null
          id?: string
          mode_paiement?: string
          numero?: string | null
          remise_usd?: number
          sous_total_usd?: number
          statut?: string
          total_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventes_boutique_id_fkey"
            columns: ["boutique_id"]
            isOneToOne: false
            referencedRelation: "boutiques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_boutique"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventes_code_promo_fk"
            columns: ["code_promo_id"]
            isOneToOne: false
            referencedRelation: "codes_promo"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          created_at: string
          credit_usd: number
          referral_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_usd?: number
          referral_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credit_usd?: number
          referral_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      admin_daily_order_stats: {
        Args: { p_days: number; p_vendor_id?: string }
        Returns: {
          commandes: number
          day: string
          revenus: number
        }[]
      }
      admin_overview_stats: { Args: never; Returns: Json }
      delivered_revenue_total: {
        Args: { p_vendor_id?: string }
        Returns: number
      }
      fn_incrementer_usage_code_promo: {
        Args: { p_code_promo_id: string }
        Returns: undefined
      }
      fn_mouvement_stock: {
        Args: {
          p_motif?: string
          p_produit_id: string
          p_quantite_delta: number
          p_reference_id?: string
          p_reference_type?: string
          p_type: string
        }
        Returns: {
          boutique_id: string
          created_at: string
          created_by: string | null
          id: string
          motif: string | null
          produit_id: string
          quantite: number
          quantite_apres: number
          reference_id: string | null
          reference_type: string | null
          type_mouvement: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_prochain_numero: {
        Args: { p_boutique_id: string; p_compteur: string }
        Returns: number
      }
      fn_receptionner_ligne: {
        Args: {
          p_ligne_id: string
          p_prix_vente_usd?: number
          p_quantite_recue: number
        }
        Returns: {
          bon_commande_id: string
          id: string
          nom_produit: string | null
          prix_achat_unitaire_usd: number
          produit_id: string | null
          quantite_commandee: number
          quantite_recue: number
        }
        SetofOptions: {
          from: "*"
          to: "bon_commande_lignes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_valider_code_promo: {
        Args: { p_boutique_id: string; p_code: string; p_montant_usd: number }
        Returns: {
          code_promo_id: string
          motif: string
          remise_usd: number
          valide: boolean
        }[]
      }
      get_my_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          id: string
          ip: string
          not_after: string
          refreshed_at: string
          updated_at: string
          user_agent: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_coupon_uses: { Args: { p_code: string }; Returns: undefined }
      increment_wallet_credit: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      is_boutique_staff: {
        Args: {
          p_boutique_id: string
          p_roles?: Database["public"]["Enums"]["boutique_role"][]
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "customer" | "vendor" | "rider" | "admin"
      boutique_promo_type: "pourcentage" | "montant_fixe"
      boutique_role: "admin" | "vendeur" | "caissier"
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
      boutique_promo_type: ["pourcentage", "montant_fixe"],
      boutique_role: ["admin", "vendeur", "caissier"],
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
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      report_target: ["product", "vendor", "rider", "order"],
      review_target: ["product", "vendor", "rider"],
      rider_status: ["pending", "active", "offline", "suspended"],
      rider_vehicle: ["moto", "velo", "pied", "voiture"],
      vendor_status: ["pending", "approved", "suspended", "rejected"],
    },
  },
} as const
