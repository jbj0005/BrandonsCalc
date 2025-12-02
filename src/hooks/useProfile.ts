/**
 * useProfile - React hook for managing user profile state
 *
 * Handles loading, saving, and updating customer profile data
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ProfileService, ProfileData } from '../services/ProfileService';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveProfileOptions {
  silent?: boolean;
}

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
  saveProfile: (data: Partial<ProfileData>, options?: SaveProfileOptions) => Promise<void>;
  updateField: (field: keyof ProfileData, value: any) => void;
  isDirty: boolean;
  autoSaveStatus: AutoSaveStatus;
  lastSavedAt: number | null;
  flushPendingChanges: () => Promise<void>;
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
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const pendingChangesRef = useRef<Partial<ProfileData>>({});
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    async (data: Partial<ProfileData>, options: SaveProfileOptions = {}) => {
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
        if (!options.silent && typeof window !== 'undefined' && window.showToast) {
          window.showToast('Profile saved successfully', 'success');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to save profile');

        // Show error toast
        if (!options.silent && typeof window !== 'undefined' && window.showToast) {
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
   * Persist any queued field changes (debounced auto-save)
   */
  const flushPendingChanges = useCallback(async () => {
    if (!profileService || !userId) return;

    const changes = pendingChangesRef.current;
    if (!changes || Object.keys(changes).length === 0) return;

    pendingChangesRef.current = {};

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    try {
      setAutoSaveStatus('saving');
      await saveProfile(changes, { silent: true });
      setAutoSaveStatus('saved');
      setLastSavedAt(Date.now());
      setIsDirty(Object.keys(pendingChangesRef.current).length > 0);
    } catch (err) {
      // Re-queue failed changes so they can be retried
      pendingChangesRef.current = { ...changes, ...pendingChangesRef.current };
      setAutoSaveStatus('error');

      if (!autoSaveTimerRef.current) {
        autoSaveTimerRef.current = setTimeout(() => {
          void flushPendingChanges();
        }, 3000);
      }
    }
  }, [profileService, saveProfile, userId]);

  /**
   * Update a single field in local state (marks as dirty)
   */
  const updateField = useCallback(
    (field: keyof ProfileData, value: any) => {
      setProfile((prev) => {
        if (!prev) return prev;
        return { ...prev, [field]: value };
      });

      pendingChangesRef.current = {
        ...pendingChangesRef.current,
        [field]: value,
      };

      setIsDirty(true);
      setAutoSaveStatus('idle');

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        void flushPendingChanges();
      }, 900);
    },
    [flushPendingChanges]
  );

  /**
   * Auto-load profile when userId changes
   */
  useEffect(() => {
    if (autoLoad && userId && supabase) {
      loadProfile();
    }
  }, [autoLoad, userId, supabase, loadProfile]);

  // Clear pending timers on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  return {
    profile,
    isLoading,
    error,
    loadProfile,
    saveProfile,
    updateField,
    isDirty,
    autoSaveStatus,
    lastSavedAt,
    flushPendingChanges,
  };
};

export default useProfile;
