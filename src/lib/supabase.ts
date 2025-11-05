// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import type { 
  User,
  UserProfile,
  GarageVehicle,
  CustomerOffer,
  SMSLog,
  RateSheet
} from '@/types';

// ========================================
// Environment Variables
// ========================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseAnonKey === 'YOUR_ANON_KEY_HERE') {
  console.warn('⚠️  Supabase environment variables not configured. Using fallback.');
  console.warn('Please add VITE_SUPABASE_ANON_KEY to your .env file');
  // Use empty strings as fallback to prevent page from breaking
  // The app will still work but Supabase features will be limited
}

// ========================================
// Supabase Client
// ========================================
// Use fallback values if not configured (prevents page from breaking)
const finalUrl = supabaseUrl && supabaseUrl !== 'YOUR_ANON_KEY_HERE' ? supabaseUrl : 'https://placeholder.supabase.co';
const finalKey = supabaseAnonKey && supabaseAnonKey !== 'YOUR_ANON_KEY_HERE' ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MDAsImV4cCI6MTk2MDc2ODgwMH0.placeholder';

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'excelcalc-auth',
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
});

const normalizeSupabaseUser = (user: SupabaseAuthUser | null): User | null => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? '',
    created_at: user.created_at ?? new Date().toISOString(),
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata
  };
};

// ========================================
// Database Types (for TypeScript)
// ========================================
export interface Database {
  public: {
    Tables: {
      customer_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserProfile, 'id'>>;
      };
      garage_vehicles: {
        Row: GarageVehicle;
        Insert: Omit<GarageVehicle, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<GarageVehicle, 'id'>>;
      };
      customer_offers: {
        Row: CustomerOffer;
        Insert: Omit<CustomerOffer, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CustomerOffer, 'id'>>;
      };
      sms_logs: {
        Row: SMSLog;
        Insert: Omit<SMSLog, 'id' | 'created_at'>;
        Update: Partial<Omit<SMSLog, 'id'>>;
      };
      rate_sheets: {
        Row: RateSheet;
        Insert: Omit<RateSheet, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<RateSheet, 'id'>>;
      };
    };
    Functions: {
      send_sms: {
        Args: {
          offer_data: CustomerOffer;
          dealer_phone: string;
          dealer_name: string;
          message?: string;
        };
        Returns: {
          success: boolean;
          message_sid?: string;
          error?: string;
        };
      };
    };
  };
}

// ========================================
// Helper Functions
// ========================================

/**
 * Get current user session
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return normalizeSupabaseUser(user);
}

/**
 * Get user profile
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
  
  return data;
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('customer_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get user's garage vehicles
 */
export async function getGarageVehicles(userId: string): Promise<GarageVehicle[]> {
  const { data, error } = await supabase
    .from('garage_vehicles')
    .select('*')
    .eq('user_id', userId)
    .order('last_used_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching garage vehicles:', error);
    return [];
  }

  return data || [];
}

/**
 * Add vehicle to garage
 */
export async function addGarageVehicle(
  userId: string,
  vehicle: Omit<GarageVehicle, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<GarageVehicle | null> {
  const { data, error } = await supabase
    .from('garage_vehicles')
    .insert({
      ...vehicle,
      user_id: userId
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding garage vehicle:', error);
    throw error;
  }

  return data;
}

/**
 * Update garage vehicle
 */
export async function updateGarageVehicle(
  vehicleId: string,
  updates: Partial<GarageVehicle>
): Promise<GarageVehicle | null> {
  const { data, error } = await supabase
    .from('garage_vehicles')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', vehicleId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating garage vehicle:', error);
    throw error;
  }
  
  return data;
}

/**
 * Delete garage vehicle
 */
export async function deleteGarageVehicle(vehicleId: string): Promise<boolean> {
  const { error } = await supabase
    .from('garage_vehicles')
    .delete()
    .eq('id', vehicleId);
  
  if (error) {
    console.error('Error deleting garage vehicle:', error);
    throw error;
  }
  
  return true;
}

/**
 * Get user's offers
 */
export async function getCustomerOffers(userId: string): Promise<CustomerOffer[]> {
  const { data, error } = await supabase
    .from('customer_offers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching customer offers:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Create new offer
 */
export async function createCustomerOffer(
  offer: Omit<CustomerOffer, 'id' | 'created_at' | 'updated_at'>
): Promise<CustomerOffer | null> {
  // Generate share token
  const shareToken = generateShareToken();
  
  const { data, error } = await supabase
    .from('customer_offers')
    .insert({
      ...offer,
      share_token: shareToken,
      status: offer.status || 'draft'
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating customer offer:', error);
    throw error;
  }
  
  return data;
}

/**
 * Update offer
 */
export async function updateCustomerOffer(
  offerId: string,
  updates: Partial<CustomerOffer>
): Promise<CustomerOffer | null> {
  const { data, error } = await supabase
    .from('customer_offers')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', offerId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating customer offer:', error);
    throw error;
  }
  
  return data;
}

/**
 * Get offer by share token
 */
export async function getOfferByShareToken(token: string): Promise<CustomerOffer | null> {
  const { data, error } = await supabase
    .from('customer_offers')
    .select('*')
    .eq('share_token', token)
    .single();
  
  if (error) {
    console.error('Error fetching offer by share token:', error);
    return null;
  }
  
  // Mark as viewed if not already
  if (data && !data.viewed_at) {
    await supabase
      .from('customer_offers')
      .update({
        viewed_at: new Date().toISOString(),
        status: 'viewed'
      })
      .eq('id', data.id);
  }
  
  return data;
}

/**
 * Get active rate sheets
 */
export async function getRateSheets(creditTier?: string): Promise<RateSheet[]> {
  let query = supabase
    .from('rate_sheets')
    .select('*')
    .eq('is_active', true);
  
  if (creditTier) {
    query = query.eq('credit_tier', creditTier);
  }
  
  const { data, error } = await query.order('apr', { ascending: true });
  
  if (error) {
    console.error('Error fetching rate sheets:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get SMS logs for an offer
 */
export async function getSMSLogs(offerId?: string): Promise<SMSLog[]> {
  let query = supabase
    .from('sms_logs')
    .select('*');
  
  if (offerId) {
    query = query.eq('offer_id', offerId);
  }
  
  const { data, error } = await query.order('sent_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching SMS logs:', error);
    return [];
  }
  
  return data || [];
}

// ========================================
// Utility Functions
// ========================================

/**
 * Generate unique share token
 */
function generateShareToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Format phone number for SMS
 */
export function formatPhoneForSMS(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Add country code if not present
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  
  return `+${digits}`;
}

// ========================================
// Real-time Subscriptions
// ========================================

/**
 * Subscribe to profile changes
 */
export function subscribeToProfileChanges(
  userId: string,
  callback: (profile: UserProfile) => void
) {
  return supabase
    .channel(`profile-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'customer_profiles',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        if (payload.new) {
          callback(payload.new as UserProfile);
        }
      }
    )
    .subscribe();
}

/**
 * Subscribe to garage changes
 */
export function subscribeToGarageChanges(
  userId: string,
  callback: (vehicles: GarageVehicle[]) => void
) {
  return supabase
    .channel(`garage-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'garage_vehicles',
        filter: `user_id=eq.${userId}`
      },
      async () => {
        // Refetch all vehicles on any change
        const vehicles = await getGarageVehicles(userId);
        callback(vehicles);
      }
    )
    .subscribe();
}

/**
 * Subscribe to offer changes
 */
export function subscribeToOfferChanges(
  userId: string,
  callback: (offers: CustomerOffer[]) => void
) {
  return supabase
    .channel(`offers-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'customer_offers',
        filter: `user_id=eq.${userId}`
      },
      async () => {
        // Refetch all offers on any change
        const offers = await getCustomerOffers(userId);
        callback(offers);
      }
    )
    .subscribe();
}

// ========================================
// Export Everything
// ========================================
export default supabase;
