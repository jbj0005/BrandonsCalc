import { supabase } from '../lib/supabase';
import type { FeeSuggestion, FeeCategory } from '../types/fees';

interface FeeSuggestionCache {
  data: FeeSuggestion[];
  timestamp: number;
}

interface FeeTemplateItem {
  name?: string;
  amount?: number;
  sort?: number;
  sort_order?: number;
  order?: number;
  [key: string]: any;
}

interface FeeSetCacheEntry {
  id: string;
  items: FeeTemplateItem[];
}

const CACHE_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const CACHE_KEY_PREFIX = 'fee_suggestions_';

const activeFeeSets: Record<FeeCategory, FeeSetCacheEntry | null> = {
  dealer: null,
  customer: null,
  gov: null,
};

export const FEE_TEMPLATES_UPDATED_EVENT = 'fee-templates-updated';

const dispatchFeeTemplatesUpdated = (category: FeeCategory) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(FEE_TEMPLATES_UPDATED_EVENT, { detail: { category } })
    );
  }
};

const normalizeAmount = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const sanitizeItems = (items: any): FeeTemplateItem[] => {
  if (Array.isArray(items)) return items as FeeTemplateItem[];
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? (parsed as FeeTemplateItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const mapItemsToSuggestions = (
  category: FeeCategory,
  setId: string | null,
  items: FeeTemplateItem[]
): FeeSuggestion[] =>
  items.map((item, index) => ({
    description: item.name || item.description || '',
    amount: normalizeAmount(item.amount),
    category,
    id: setId ? `${setId}:${index}` : undefined,
    setId,
    index,
  }));

const getCacheKey = (category: FeeCategory): string => `${CACHE_KEY_PREFIX}${category}`;

const getCachedSuggestions = (category: FeeCategory): FeeSuggestion[] | null => {
  try {
    const cached = localStorage.getItem(getCacheKey(category));
    if (!cached) return null;
    const parsed: FeeSuggestionCache = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
      return parsed.data;
    }
    localStorage.removeItem(getCacheKey(category));
    return null;
  } catch {
    return null;
  }
};

const cacheSuggestions = (category: FeeCategory, data: FeeSuggestion[]): void => {
  try {
    const cacheData: FeeSuggestionCache = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(getCacheKey(category), JSON.stringify(cacheData));
  } catch {
    // Ignore cache errors
  }
};

const getTableName = (category: FeeCategory): string => {
  const tableMap = {
    dealer: 'dealer_fee_sets',
    customer: 'customer_addon_sets',
    gov: 'gov_fee_sets',
  } as const;
  return tableMap[category];
};

const getViewTableName = (category: FeeCategory): string => {
  const viewTableMap = {
    dealer: 'dealer_fee_items_v',
    customer: 'customer_addon_items_v',
    gov: 'gov_fee_items_v',
  } as const;
  return viewTableMap[category];
};

const fetchActiveFeeSet = async (
  category: FeeCategory,
  preferredSetId?: string | null
): Promise<FeeSetCacheEntry | null> => {
  const cached = activeFeeSets[category];
  if (cached && (!preferredSetId || cached.id === preferredSetId)) {
    return cached;
  }

  const tableName = getTableName(category);
  let query = supabase
    .from(tableName)
    .select('id, items')
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (preferredSetId) {
    query = supabase.from(tableName).select('id, items').eq('id', preferredSetId).limit(1);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    activeFeeSets[category] = null;
    return null;
  }

  const row = data[0];
  const items = sanitizeItems(row.items);
  const entry = { id: row.id, items };
  activeFeeSets[category] = entry;
  return entry;
};

export async function fetchFeeSuggestions(category: FeeCategory): Promise<FeeSuggestion[]> {
  const cached = getCachedSuggestions(category);
  if (cached) return cached;

  const activeSet = await fetchActiveFeeSet(category);
  if (activeSet && activeSet.items.length > 0) {
    const suggestions = mapItemsToSuggestions(category, activeSet.id, activeSet.items);
    cacheSuggestions(category, suggestions);
    return suggestions;
  }

  // Fallback to read-only view
  try {
    const viewTableName = getViewTableName(category);
    const { data, error } = await supabase.from(viewTableName).select('name, amount').order('name');
    if (error) throw error;
    const suggestions: FeeSuggestion[] = (data || []).map((item: any) => ({
      description: item.name,
      amount: normalizeAmount(item.amount),
      category,
    }));
    cacheSuggestions(category, suggestions);
    return suggestions;
  } catch {
    return [];
  }
}

export async function fetchAllFeeSuggestions(): Promise<Record<FeeCategory, FeeSuggestion[]>> {
  const [dealer, customer, gov] = await Promise.all([
    fetchFeeSuggestions('dealer'),
    fetchFeeSuggestions('customer'),
    fetchFeeSuggestions('gov'),
  ]);

  return { dealer, customer, gov };
}

export function clearFeeSuggestionsCache(category?: FeeCategory): void {
  try {
    if (category) {
      localStorage.removeItem(getCacheKey(category));
      activeFeeSets[category] = null;
    } else {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(CACHE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      activeFeeSets.dealer = activeFeeSets.customer = activeFeeSets.gov = null;
    }
  } catch {
    // ignore cache clear failures
  }
}

const parseTemplateIdentifier = (templateId?: string | null): { setId: string; index: number } | null => {
  if (!templateId) return null;
  const [setId, indexRaw] = templateId.split(':');
  const index = Number(indexRaw);
  if (!setId || Number.isNaN(index)) return null;
  return { setId, index };
};

const updateFeeItems = async (
  category: FeeCategory,
  updater: (items: FeeTemplateItem[]) => FeeTemplateItem[],
  preferredSetId?: string | null
): Promise<{ success: boolean; error?: string }> => {
  const tableName = getTableName(category);
  const activeSet = await fetchActiveFeeSet(category, preferredSetId);

  if (!activeSet) {
    return { success: false, error: 'No active fee set found for this category' };
  }

  let updatedItems: FeeTemplateItem[];
  try {
    updatedItems = updater(activeSet.items);
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to update fee templates',
    };
  }

  try {
    const { error } = await supabase
      .from(tableName)
      .update({ items: updatedItems })
      .eq('id', activeSet.id);

    if (error) throw error;

    activeFeeSets[category] = { id: activeSet.id, items: updatedItems };
    clearFeeSuggestionsCache(category);
    dispatchFeeTemplatesUpdated(category);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update fee templates' };
  }
};

export async function addFeeTemplate(
  category: FeeCategory,
  description: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  return updateFeeItems(
    category,
    (items) => {
      const nextSort =
        Math.max(
          0,
          ...items.map((item) =>
            Number(item.sort ?? item.sort_order ?? item.order ?? 0)
          )
        ) + 1;

      return [
        ...items,
        {
          name: description,
          amount,
          sort: nextSort,
        },
      ];
    }
  );
}

export async function updateFeeTemplate(
  category: FeeCategory,
  templateId: string | undefined,
  description: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  const parsed = parseTemplateIdentifier(templateId);
  if (!parsed) {
    return { success: false, error: 'Template metadata missing; please refresh and try again.' };
  }

  return updateFeeItems(
    category,
    (items) => {
      if (!items[parsed.index]) {
        throw new Error('Template no longer exists. Please refresh.');
      }

      const updated = [...items];
      updated[parsed.index] = {
        ...updated[parsed.index],
        name: description,
        amount,
      };
      return updated;
    },
    parsed.setId
  );
}

export async function deleteFeeTemplate(
  category: FeeCategory,
  templateId: string | undefined
): Promise<{ success: boolean; error?: string }> {
  const parsed = parseTemplateIdentifier(templateId);
  if (!parsed) {
    return { success: false, error: 'Template metadata missing; please refresh and try again.' };
  }

  return updateFeeItems(
    category,
    (items) => {
      if (!items[parsed.index]) {
        throw new Error('Template no longer exists. Please refresh.');
      }
      const updated = items.filter((_, idx) => idx !== parsed.index);
      return updated;
    },
    parsed.setId
  );
}
