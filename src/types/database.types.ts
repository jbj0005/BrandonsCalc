export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      auto_rates: {
        Row: {
          id: string
          source: string
          source_url: string | null
          loan_type: string | null
          term_label: string | null
          term_range_min: number | null
          term_range_max: number | null
          credit_tier: string | null
          credit_tier_label: string | null
          credit_score_min: number | null
          credit_score_max: number | null
          base_apr_percent: number | null
          apr_adjustment: number | null
          apr_percent: number
          effective_at: string
          created_at: string
          vehicle_condition: string | null
          term_months_min: number | null
          term_months_max: number | null
        }
        Insert: {
          id?: string
          source: string
          source_url?: string | null
          loan_type?: string | null
          term_label?: string | null
          term_range_min?: number | null
          term_range_max?: number | null
          credit_tier?: string | null
          credit_tier_label?: string | null
          credit_score_min?: number | null
          credit_score_max?: number | null
          base_apr_percent?: number | null
          apr_adjustment?: number | null
          apr_percent: number
          effective_at: string
          created_at?: string
          vehicle_condition?: string | null
          term_months_min?: number | null
          term_months_max?: number | null
        }
        Update: {
          id?: string
          source?: string
          source_url?: string | null
          loan_type?: string | null
          term_label?: string | null
          term_range_min?: number | null
          term_range_max?: number | null
          credit_tier?: string | null
          credit_tier_label?: string | null
          credit_score_min?: number | null
          credit_score_max?: number | null
          base_apr_percent?: number | null
          apr_adjustment?: number | null
          apr_percent?: number
          effective_at?: string
          created_at?: string
          vehicle_condition?: string | null
          term_months_min?: number | null
          term_months_max?: number | null
        }
      }
      garage_vehicles: {
        Row: {
          id: string
          user_id: string
          nickname: string | null
          year: number
          make: string
          model: string
          trim: string | null
          vin: string | null
          mileage: number | null
          condition: string | null
          estimated_value: number | null
          payoff_amount: number | null
          photo_url: string | null
          photo_storage_path: string | null
          notes: string | null
          times_used: number | null
          last_used_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nickname?: string | null
          year: number
          make: string
          model: string
          trim?: string | null
          vin?: string | null
          mileage?: number | null
          condition?: string | null
          estimated_value?: number | null
          payoff_amount?: number | null
          photo_url?: string | null
          photo_storage_path?: string | null
          notes?: string | null
          times_used?: number | null
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nickname?: string | null
          year?: number
          make?: string
          model?: string
          trim?: string | null
          vin?: string | null
          mileage?: number | null
          condition?: string | null
          estimated_value?: number | null
          payoff_amount?: number | null
          photo_url?: string | null
          photo_storage_path?: string | null
          notes?: string | null
          times_used?: number | null
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      customer_profiles: {
        Row: {
          id: string
          user_id: string | null
          email: string
          full_name: string | null
          phone: string | null
          street_address: string | null
          city: string | null
          state: string | null
          state_code: string | null
          zip_code: string | null
          county: string | null
          county_name: string | null
          google_place_id: string | null
          preferred_credit_score: string | null
          preferred_down_payment: number | null
          preferred_trade_value: number | null
          preferred_trade_payoff: number | null
          preferred_lender_id: string | null
          preferred_term: number | null
          credit_score_range: string | null
          created_at: string
          updated_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          email: string
          full_name?: string | null
          phone?: string | null
          street_address?: string | null
          city?: string | null
          state?: string | null
          state_code?: string | null
          zip_code?: string | null
          county?: string | null
          county_name?: string | null
          google_place_id?: string | null
          preferred_credit_score?: string | null
          preferred_down_payment?: number | null
          preferred_trade_value?: number | null
          preferred_trade_payoff?: number | null
          preferred_lender_id?: string | null
          preferred_term?: number | null
          credit_score_range?: string | null
          created_at?: string
          updated_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          email?: string
          full_name?: string | null
          phone?: string | null
          street_address?: string | null
          city?: string | null
          state?: string | null
          state_code?: string | null
          zip_code?: string | null
          county?: string | null
          county_name?: string | null
          google_place_id?: string | null
          preferred_credit_score?: string | null
          preferred_down_payment?: number | null
          preferred_trade_value?: number | null
          preferred_trade_payoff?: number | null
          preferred_lender_id?: string | null
          preferred_term?: number | null
          credit_score_range?: string | null
          created_at?: string
          updated_at?: string
          last_used_at?: string | null
        }
      }
      vehicles: {
        Row: {
          id: string
          user_id: string
          vehicle: string | null
          year: number
          make: string
          model: string
          asking_price: number | null
          inserted_at: string
          mileage: number | null
          trim: string | null
          dealer_name: string | null
          dealer_street: string | null
          dealer_city: string | null
          dealer_state: string | null
          dealer_zip: string | null
          dealer_phone: string | null
          dealer_lat: number | null
          dealer_lng: number | null
          listing_id: string | null
          listing_source: string | null
          listing_url: string | null
          vin: string | null
          heading: string | null
          photo_url: string | null
          marketcheck_payload: Json | null
          condition: string | null
          estimated_value: number | null
          payoff_amount: number | null
        }
        Insert: {
          id?: string
          user_id: string
          vehicle?: string | null
          year: number
          make: string
          model: string
          asking_price?: number | null
          inserted_at?: string
          mileage?: number | null
          trim?: string | null
          dealer_name?: string | null
          dealer_street?: string | null
          dealer_city?: string | null
          dealer_state?: string | null
          dealer_zip?: string | null
          dealer_phone?: string | null
          dealer_lat?: number | null
          dealer_lng?: number | null
          listing_id?: string | null
          listing_source?: string | null
          listing_url?: string | null
          vin?: string | null
          heading?: string | null
          photo_url?: string | null
          marketcheck_payload?: Json | null
          condition?: string | null
          estimated_value?: number | null
          payoff_amount?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          vehicle?: string | null
          year?: number
          make?: string
          model?: string
          asking_price?: number | null
          inserted_at?: string
          mileage?: number | null
          trim?: string | null
          dealer_name?: string | null
          dealer_street?: string | null
          dealer_city?: string | null
          dealer_state?: string | null
          dealer_zip?: string | null
          dealer_phone?: string | null
          dealer_lat?: number | null
          dealer_lng?: number | null
          listing_id?: string | null
          listing_source?: string | null
          listing_url?: string | null
          vin?: string | null
          heading?: string | null
          photo_url?: string | null
          marketcheck_payload?: Json | null
          condition?: string | null
          estimated_value?: number | null
          payoff_amount?: number | null
        }
      }
      customer_offers: {
        Row: {
          id: string
          customer_profile_id: string
          offer_name: string
          status: string
          user_id: string | null
          vehicle_year: number | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_trim: string | null
          vehicle_vin: string | null
          vehicle_mileage: number | null
          vehicle_condition: string | null
          vehicle_price: number | null
          offer_price: number | null
          down_payment: number | null
          trade_value: number | null
          trade_payoff: number | null
          trade_in_details: Json | null
          apr: number | null
          term_months: number | null
          monthly_payment: number | null
          dealer_fees: number | null
          customer_addons: number | null
          customer_name: string | null
          customer_email: string | null
          customer_phone: string | null
          customer_address: string | null
          dealer_name: string | null
          dealer_address: string | null
          dealer_phone: string | null
          offer_text: string | null
          submitted_at: string | null
          closed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_profile_id: string
          offer_name: string
          status?: string
          user_id?: string | null
          vehicle_year?: number | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_trim?: string | null
          vehicle_vin?: string | null
          vehicle_mileage?: number | null
          vehicle_condition?: string | null
          vehicle_price?: number | null
          offer_price?: number | null
          down_payment?: number | null
          trade_value?: number | null
          trade_payoff?: number | null
          trade_in_details?: Json | null
          apr?: number | null
          term_months?: number | null
          monthly_payment?: number | null
          dealer_fees?: number | null
          customer_addons?: number | null
          customer_name?: string | null
          customer_email?: string | null
          customer_phone?: string | null
          customer_address?: string | null
          dealer_name?: string | null
          dealer_address?: string | null
          dealer_phone?: string | null
          offer_text?: string | null
          submitted_at?: string | null
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_profile_id?: string
          offer_name?: string
          status?: string
          user_id?: string | null
          vehicle_year?: number | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_trim?: string | null
          vehicle_vin?: string | null
          vehicle_mileage?: number | null
          vehicle_condition?: string | null
          vehicle_price?: number | null
          offer_price?: number | null
          down_payment?: number | null
          trade_value?: number | null
          trade_payoff?: number | null
          trade_in_details?: Json | null
          apr?: number | null
          term_months?: number | null
          monthly_payment?: number | null
          dealer_fees?: number | null
          customer_addons?: number | null
          customer_name?: string | null
          customer_email?: string | null
          customer_phone?: string | null
          customer_address?: string | null
          dealer_name?: string | null
          dealer_address?: string | null
          dealer_phone?: string | null
          offer_text?: string | null
          submitted_at?: string | null
          closed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      sms_logs: {
        Row: {
          id: string
          offer_id: string | null
          message_sid: string
          to_phone: string
          from_phone: string
          dealer_name: string | null
          customer_name: string | null
          status: string | null
          error_message: string | null
          sent_at: string
          delivered_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          offer_id?: string | null
          message_sid: string
          to_phone: string
          from_phone: string
          dealer_name?: string | null
          customer_name?: string | null
          status?: string | null
          error_message?: string | null
          sent_at?: string
          delivered_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          offer_id?: string | null
          message_sid?: string
          to_phone?: string
          from_phone?: string
          dealer_name?: string | null
          customer_name?: string | null
          status?: string | null
          error_message?: string | null
          sent_at?: string
          delivered_at?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
