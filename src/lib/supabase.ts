// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import type { 
  User,
  UserProfile,
  GarageVehicle,
  GarageShareLink,
  GarageInvite,
  GarageMember,
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
      garage_members: {
        Row: GarageMember;
        Insert: Omit<GarageMember, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<GarageMember, 'id'>>;
      };
      garage_invites: {
        Row: GarageInvite;
        Insert: Omit<GarageInvite, 'id' | 'created_at' | 'updated_at' | 'accepted_at' | 'accepted_by'>;
        Update: Partial<Omit<GarageInvite, 'id'>>;
      };
      garage_share_links: {
        Row: GarageShareLink;
        Insert: Omit<GarageShareLink, 'id' | 'created_at'>;
        Update: Partial<Omit<GarageShareLink, 'id'>>;
      };
      vehicle_copies: {
        Row: {
          id: string;
          source_vehicle_id: string | null;
          source_garage_owner_id: string | null;
          target_user_id: string;
          target_garage_owner_id: string | null;
          copy_type: 'garage' | 'saved';
          created_at: string;
        };
        Insert: Omit<{
          id: string;
          source_vehicle_id: string | null;
          source_garage_owner_id: string | null;
          target_user_id: string;
          target_garage_owner_id: string | null;
          copy_type: 'garage' | 'saved';
          created_at: string;
        }, 'id' | 'created_at'>;
        Update: Partial<{
          id: string;
          source_vehicle_id: string | null;
          source_garage_owner_id: string | null;
          target_user_id: string;
          target_garage_owner_id: string | null;
          copy_type: 'garage' | 'saved';
          created_at: string;
        }>;
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
      get_accessible_garage_vehicles: {
        Args: Record<PropertyKey, never>;
        Returns: (GarageVehicle & {
          garage_owner_id: string;
          access_role: string;
          source: 'own' | 'shared';
        })[];
      };
      create_garage_share_link: {
        Args: {
          p_garage_owner_id?: string | null;
          p_expires_at?: string | null;
          p_max_views?: number | null;
        };
        Returns: {
          id: string;
          token: string;
          expires_at: string | null;
          max_views: number | null;
          role: string;
          created_at: string;
        }[];
      };
      revoke_garage_share_link: {
        Args: {
          p_link_id: string;
        };
        Returns: boolean;
      };
      get_shared_garage_vehicles: {
        Args: {
          p_token: string;
        };
        Returns: (GarageVehicle & {
          garage_owner_id: string;
          source: string;
        })[];
      };
      accept_garage_invite: {
        Args: {
          p_token: string;
        };
        Returns: boolean;
      };
      copy_garage_vehicle_to_user: {
        Args: {
          p_vehicle_id: string;
          p_target_garage_owner_id?: string | null;
        };
        Returns: GarageVehicle[];
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
    return [];
  }

  return data || [];
}

/**
 * Get all garage vehicles the current user can access (own + shared)
 */
export async function getAccessibleGarageVehicles(): Promise<GarageVehicle[]> {
  const { data, error } = await supabase.rpc('get_accessible_garage_vehicles');

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * List garage members for a given garage (owner's garage)
 */
export async function listGarageMembers(garageOwnerId?: string): Promise<GarageMember[]> {
  let query = supabase.from('garage_members').select('*');
  if (garageOwnerId) {
    query = query.eq('garage_owner_id', garageOwnerId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * List active share links for a garage
 */
export async function listGarageShareLinks(garageOwnerId?: string): Promise<GarageShareLink[]> {
  let query = supabase.from('garage_share_links').select('*').order('created_at', { ascending: false });
  if (garageOwnerId) {
    query = query.eq('garage_owner_id', garageOwnerId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * List invites for a garage
 */
export async function listGarageInvites(garageOwnerId?: string): Promise<GarageInvite[]> {
  let query = supabase.from('garage_invites').select('*').order('created_at', { ascending: false });
  if (garageOwnerId) {
    query = query.eq('garage_owner_id', garageOwnerId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Create a garage invite for an email
 */
export async function createGarageInvite(params: {
  garageOwnerId: string;
  email: string;
  role: 'viewer' | 'manager';
  expiresAt?: string | Date | null;
  invitedBy?: string | null;
}): Promise<GarageInvite | null> {
  const inviteToken = generateShareToken();

  const { data, error } = await supabase.from('garage_invites').insert({
    garage_owner_id: params.garageOwnerId,
    email: params.email,
    role: params.role,
    token: inviteToken,
    expires_at: params.expiresAt
      ? params.expiresAt instanceof Date
        ? params.expiresAt.toISOString()
        : params.expiresAt
      : null,
    invited_by: params.invitedBy ?? null,
  }).select().single();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Create a new view-only share link
 */
export async function createGarageShareLink(params?: {
  garageOwnerId?: string;
  expiresAt?: string | Date | null;
  maxViews?: number | null;
}): Promise<GarageShareLink | null> {
  const { data, error } = await supabase.rpc('create_garage_share_link', {
    p_garage_owner_id: params?.garageOwnerId ?? null,
    p_expires_at: params?.expiresAt
      ? params.expiresAt instanceof Date
        ? params.expiresAt.toISOString()
        : params.expiresAt
      : null,
    p_max_views: params?.maxViews ?? null
  });

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

/**
 * Revoke a share link
 */
export async function revokeGarageShareLink(linkId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('revoke_garage_share_link', {
    p_link_id: linkId
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

/**
 * Fetch vehicles using a share token (no auth required)
 */
export async function getSharedGarageVehiclesByToken(token: string): Promise<GarageVehicle[]> {
  const { data, error } = await supabase.rpc('get_shared_garage_vehicles', {
    p_token: token
  });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Accept an invite by token (auth required)
 */
export async function acceptGarageInvite(token: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('accept_garage_invite', {
    p_token: token
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

/**
 * Copy a shared garage vehicle into the current user's garage
 */
export async function copyGarageVehicleToUser(vehicleId: string, targetGarageOwnerId?: string): Promise<GarageVehicle | null> {
  const { data, error } = await supabase.rpc('copy_garage_vehicle_to_user', {
    p_vehicle_id: vehicleId,
    p_target_garage_owner_id: targetGarageOwnerId ?? null
  });

  if (error) {
    throw error;
  }

  return data?.[0] || null;
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
    throw error;
  }

  return data;
}

/**
 * Delete garage vehicle
 */
export async function deleteGarageVehicle(vehicleId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('garage_vehicles')
    .delete()
    .eq('id', vehicleId)
    .select('photo_storage_path')
    .single();

  if (error) {
    throw error;
  }

  if (data?.photo_storage_path) {
    try {
      await supabase.storage.from('garage-vehicle-photos').remove([data.photo_storage_path]);
    } catch (storageError) {
      // Silent fail on photo deletion
    }
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
