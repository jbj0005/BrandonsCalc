/**
 * useProfile - React hook for managing user profile state
 *
 * Handles loading, saving, and updating customer profile data
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ProfileService, ProfileData } from '../services/ProfileService';

export interface UseProfileOptions {
  supabase: SupabaseClient | null;
  userId: string | null;
  userEmail?: string | null;
  autoLoad?: boolean;
}

export interface UseProfileReturn {
  profile: ProfileData | null;
  isLoading: boolean;
  error: string | null;
  loadProfile: () => Promise<void>;
  saveProfile: (data: Partial<ProfileData>) => Promise<void>;
  updateField: (field: keyof ProfileData, value: any) => void;
  isDirty: boolean;
}

export const useProfile = ({
  supabase,
  userId,
  userEmail,
  autoLoad = true,
}: UseProfileOptions): UseProfileReturn => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Create profile service instance
  const profileService = useMemo(() => {
    if (!supabase) return null;
    return new ProfileService(supabase);
  }, [supabase]);

  /**
   * Load profile from database
   */
  const loadProfile = useCallback(async () => {
    if (!profileService || !userId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let profileData = await profileService.loadProfile(userId);

      // If no profile exists, initialize one
      if (!profileData && userEmail) {
        profileData = await profileService.initializeProfile(userId, userEmail);
      }

      setProfile(profileData);

      // Touch last_used_at
      if (profileData) {
        profileService.touchProfile(userId);
      }

      // Emit profile-loaded event for legacy compatibility
      if (typeof window !== 'undefined' && profileData) {
        window.dispatchEvent(new CustomEvent('profile-loaded', { detail: profileData }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [profileService, userId, userEmail]);

  /**
   * Save profile to database
   */
  const saveProfile = useCallback(
    async (data: Partial<ProfileData>) => {
      if (!profileService || !userId) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const updatedProfile = await profileService.saveProfile(userId, data);
        setProfile(updatedProfile);
        setIsDirty(false);

        // Show success toast
        if (typeof window !== 'undefined' && window.showToast) {
          window.showToast('Profile saved successfully', 'success');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to save profile');

        // Show error toast
        if (typeof window !== 'undefined' && window.showToast) {
          window.showToast('Failed to save profile', 'error');
        }

        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [profileService, userId]
  );

  /**
   * Update a single field in local state (marks as dirty)
   */
  const updateField = useCallback((field: keyof ProfileData, value: any) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
    setIsDirty(true);
  }, []);

  /**
   * Auto-load profile when userId changes
   */
  useEffect(() => {
    if (autoLoad && userId && supabase) {
      loadProfile();
    }
  }, [autoLoad, userId, supabase, loadProfile]);

  return {
    profile,
    isLoading,
    error,
    loadProfile,
    saveProfile,
    updateField,
    isDirty,
  };
};

export default useProfile;
