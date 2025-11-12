/**
 * useCashDownAutoPopulate - Auto-populate cash down from customer's preferred amount
 *
 * Loads preferred_down_payment from customer_profiles after a vehicle is selected
 * and updates the cash down value.
 */

import { useEffect } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';

interface UseCashDownAutoPopulateOptions {
  supabase: SupabaseClient | null;
  userId: string | null;
  vehicleSelected: boolean;
  isEnabled?: boolean;
  onCashDownUpdate?: (amount: number) => void;
}

export const useCashDownAutoPopulate = ({
  supabase,
  userId,
  vehicleSelected,
  isEnabled = true,
  onCashDownUpdate,
}: UseCashDownAutoPopulateOptions) => {
  useEffect(() => {
    if (!isEnabled || !supabase || !userId || !vehicleSelected) return;

    const autoPopulateCashDown = async () => {
      try {
        const { data: profile, error } = await supabase
          .from('customer_profiles')
          .select('preferred_down_payment')
          .eq('user_id', userId)
          .single();

        if (error || !profile || profile.preferred_down_payment == null) {
          return;
        }

        // Parse the preferred down payment (could be string or number)
        const raw = profile.preferred_down_payment;
        const preferredDown =
          typeof raw === 'string'
            ? parseFloat(raw.replace(/[^0-9.]/g, ''))
            : Number(raw);

        if (!Number.isFinite(preferredDown) || preferredDown < 0) {
          return;
        }

        // Store baseline for diff tracking
        if (typeof window !== 'undefined') {
          window.cashDownBaseline = preferredDown;
        }

        // Notify parent component
        if (onCashDownUpdate) {
          onCashDownUpdate(preferredDown);
        }
      } catch (error) {
        // Silent fail
      }
    };

    autoPopulateCashDown();
  }, [supabase, userId, vehicleSelected, isEnabled, onCashDownUpdate]);
};
