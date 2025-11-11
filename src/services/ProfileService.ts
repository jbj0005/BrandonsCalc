/**
 * ProfileService - CRUD operations for customer_profiles
 *
 * Handles all interactions with the customer_profiles table in Supabase
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { DisplayPreferences } from '../types';
import { DEFAULT_DISPLAY_PREFERENCES } from '../types';

export interface ProfileData {
  id?: string;
  user_id?: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  state_code?: string | null;
  zip_code?: string | null;
  county?: string | null;
  county_name?: string | null;
  google_place_id?: string | null;
  preferred_credit_score?: string | null;
  credit_score_range?: string | null;
  preferred_down_payment?: number | null;
  display_preferences?: DisplayPreferences | null;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string | null;
}

export class ProfileService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Load user profile from customer_profiles table
   */
  async loadProfile(userId: string): Promise<ProfileData | null> {
    try {
      const { data, error } = await this.supabase
        .from('customer_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // If no profile exists, return null (not an error)
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data as ProfileData;
    } catch (error) {
      console.error('[ProfileService] Error loading profile:', error);
      throw error;
    }
  }

  /**
   * Save/update user profile
   * Uses UPSERT to create if not exists, update if exists
   */
  async saveProfile(userId: string, profileData: Partial<ProfileData>): Promise<ProfileData> {
    try {
      const dataToSave = {
        ...profileData,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from('customer_profiles')
        .upsert(dataToSave, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (error) throw error;

      // Emit profile-updated event for legacy compatibility
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: data }));
      }

      return data as ProfileData;
    } catch (error) {
      console.error('[ProfileService] Error saving profile:', error);
      throw error;
    }
  }

  /**
   * Initialize profile on first sign-in
   * Creates a basic profile with email only
   */
  async initializeProfile(userId: string, email: string): Promise<ProfileData> {
    try {
      const { data, error } = await this.supabase
        .from('customer_profiles')
        .insert({
          user_id: userId,
          email: email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return data as ProfileData;
    } catch (error) {
      console.error('[ProfileService] Error initializing profile:', error);
      throw error;
    }
  }

  /**
   * Update last_used_at timestamp
   */
  async touchProfile(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('customer_profiles')
        .update({
          last_used_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('[ProfileService] Error touching profile:', error);
      // Non-critical, don't throw
    }
  }

  /**
   * Load display preferences from profile
   * Returns DEFAULT_DISPLAY_PREFERENCES if none are set
   */
  async loadDisplayPreferences(userId: string): Promise<DisplayPreferences> {
    try {
      const profile = await this.loadProfile(userId);

      if (!profile || !profile.display_preferences) {
        return DEFAULT_DISPLAY_PREFERENCES;
      }

      // Merge with defaults to ensure all fields exist
      return {
        selectedVehicleCard: {
          ...DEFAULT_DISPLAY_PREFERENCES.selectedVehicleCard,
          ...(profile.display_preferences as any).selectedVehicleCard,
        },
        previewOffer: {
          ...DEFAULT_DISPLAY_PREFERENCES.previewOffer,
          ...(profile.display_preferences as any).previewOffer,
        },
      };
    } catch (error) {
      console.error('[ProfileService] Error loading display preferences:', error);
      return DEFAULT_DISPLAY_PREFERENCES;
    }
  }

  /**
   * Save display preferences to profile
   */
  async saveDisplayPreferences(
    userId: string,
    preferences: DisplayPreferences
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('customer_profiles')
        .upsert(
          {
            user_id: userId,
            display_preferences: preferences as any,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) throw error;

      // Emit display-preferences-updated event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('display-preferences-updated', { detail: preferences })
        );
      }
    } catch (error) {
      console.error('[ProfileService] Error saving display preferences:', error);
      throw error;
    }
  }

  /**
   * Format phone number for display
   */
  static formatPhone(phone: string | null | undefined): string {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  }

  /**
   * Parse phone number from formatted string
   */
  static parsePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  /**
   * Format down payment for display
   */
  static formatDownPayment(amount: number | null | undefined): string {
    if (amount == null) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Parse down payment from formatted string
   */
  static parseDownPayment(formatted: string): number {
    const cleaned = formatted.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }
}

export default ProfileService;
