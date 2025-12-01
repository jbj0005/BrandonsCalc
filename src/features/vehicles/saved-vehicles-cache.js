/**
 * SavedVehiclesCache - Singleton cache for user's saved vehicles
 *
 * Features:
 * - Map-based O(1) lookup
 * - Request deduplication for concurrent fetches
 * - TTL-based cache freshness (60s default)
 * - EventEmitter pattern for reactive UI updates
 * - Optimistic mutations with automatic rollback
 * - Realtime subscription to Supabase postgres_changes
 * - Cross-tab sync via Supabase realtime
 */

class SavedVehiclesCache {
  constructor() {
    // Map<vehicleId, vehicle> for O(1) lookups
    this.cache = new Map();

    // Timestamp of last successful fetch
    this.lastFetchTime = null;

    // Cache TTL: Infinity (realtime subscription keeps data fresh)
    // No polling needed - mutations trigger realtime events instantly
    this.ttl = Infinity;

    // Active fetch promise for deduplication
    this.activeFetchPromise = null;

    // Supabase client instance
    this.supabase = null;

    // Supabase realtime subscription
    this.subscription = null;

    // Current user ID (for RLS filtering)
    this.userId = null;

    // Event listeners: { 'change': [fn1, fn2], 'error': [fn3] }
    this.listeners = {};

    // Loading state
    this.isLoading = false;

    // Error state
    this.lastError = null;

    // Track pending mutations to deduplicate realtime events
    // Map<vehicleId, { action: 'add'|'update'|'delete', timestamp: number }>
    this.pendingMutations = new Map();
  }

  /**
   * Get all vehicles from cache or fetch if stale/empty
   * @param {Object} options
   * @param {boolean} options.forceRefresh - Skip cache and force fetch
   * @returns {Promise<Array>} Array of vehicle objects
   */
  async getVehicles({ forceRefresh = false } = {}) {
    const cacheAge = this.lastFetchTime ? Date.now() - this.lastFetchTime : Infinity;
    const isFresh = cacheAge < this.ttl;

    // Use cache if fresh, not empty, and not forcing refresh
    if (!forceRefresh && isFresh && this.cache.size > 0) {
      return Array.from(this.cache.values());
    }

    // Deduplicate concurrent requests - return existing promise
    if (this.activeFetchPromise) {
      return this.activeFetchPromise;
    }

    // Create new fetch promise
    this.activeFetchPromise = this._fetchFromSupabase();

    try {
      const vehicles = await this.activeFetchPromise;

      // Only update cache if this fetch is still the active one
      // (prevents stale responses from overwriting newer data)
      if (this.activeFetchPromise === this.activeFetchPromise) {
        this.cache.clear();
        vehicles.forEach(v => this.cache.set(v.id, v));
        this.lastFetchTime = Date.now();
        this.lastError = null;

        this.emit('change', Array.from(this.cache.values()));
      }

      return vehicles;
    } catch (error) {
      this.lastError = error;
      this.emit('error', error);
      throw error;
    } finally {
      this.activeFetchPromise = null;
      this.isLoading = false;
    }
  }

  /**
   * Fetch vehicles from Supabase (private method)
   */
  async _fetchFromSupabase() {
    if (!this.supabase || !this.userId) {
      return [];
    }

    this.isLoading = true;
    this.emit('loading', true);

    try {
      const { data, error } = await this.supabase
        .from('vehicles')
        .select(`
          id,
          user_id,
          vin,
          year,
          make,
          model,
          trim,
          mileage,
          condition,
          heading,
          asking_price,
          dealer_name,
          dealer_street,
          dealer_city,
          dealer_state,
          dealer_zip,
          dealer_phone,
          dealer_lat,
          dealer_lng,
          listing_id,
          listing_source,
          listing_url,
          photo_url,
          inserted_at,
          last_refreshed_at,
          previous_asking_price,
          previous_mileage,
          marketcheck_payload
        `)
        .eq('user_id', this.userId)
        .order('inserted_at', { ascending: false });

      if (error) throw error;

      // Normalize data (matching existing loadSavedVehicles logic)
      const normalizedVehicles = (data || []).map(vehicle => ({
        ...vehicle,
        // Normalize condition field
        condition: vehicle.condition?.toLowerCase() === 'used' ? 'Used' :
                   vehicle.condition?.toLowerCase() === 'new' ? 'New' :
                   vehicle.condition || 'Used',
        // Parse lat/lng as numbers
        dealer_lat: vehicle.dealer_lat ? parseFloat(vehicle.dealer_lat) : null,
        dealer_lng: vehicle.dealer_lng ? parseFloat(vehicle.dealer_lng) : null
      }));

      return normalizedVehicles;
    } catch (error) {
      throw error;
    } finally {
      this.emit('loading', false);
    }
  }

  /**
   * Get a single vehicle by ID
   */
  getVehicle(id) {
    return this.cache.get(id);
  }

  /**
   * Add a vehicle (optimistic update)
   */
  async addVehicle(vehicleData) {
    if (!this.supabase || !this.userId) {
      throw new Error('Cannot add vehicle: No Supabase client or user ID');
    }

    // Optimistic: Add to cache immediately with temporary ID
    const tempId = `temp-${Date.now()}`;
    const optimisticVehicle = { ...vehicleData, id: tempId };
    this.cache.set(tempId, optimisticVehicle);
    this.emit('change', Array.from(this.cache.values()));

    try {
      const { data, error } = await this.supabase
        .from('vehicles')
        .insert([{ ...vehicleData, user_id: this.userId }])
        .select()
        .single();

      if (error) throw error;

      // Mark as pending to ignore realtime duplicate
      this.pendingMutations.set(data.id, { action: 'add', timestamp: Date.now() });

      // Replace temp vehicle with real one
      this.cache.delete(tempId);
      this.cache.set(data.id, data);
      this.lastFetchTime = Date.now(); // Reset TTL
      this.emit('change', Array.from(this.cache.values()));

      // Clear pending after 2 seconds (realtime should fire within this window)
      setTimeout(() => this.pendingMutations.delete(data.id), 2000);

      return data;
    } catch (error) {
      // Rollback: Remove temp vehicle
      this.cache.delete(tempId);
      this.emit('change', Array.from(this.cache.values()));
      throw error;
    }
  }

  /**
   * Update a vehicle (optimistic update)
   */
  async updateVehicle(id, updates) {
    if (!this.supabase) {
      throw new Error('Cannot update vehicle: No Supabase client');
    }

    // Backup for rollback
    const backup = this.cache.get(id);
    if (!backup) {
      throw new Error(`Vehicle ${id} not found in cache`);
    }

    // Optimistic: Update cache immediately
    const optimisticVehicle = { ...backup, ...updates };
    this.cache.set(id, optimisticVehicle);
    this.emit('change', Array.from(this.cache.values()));

    try {
      const { data, error } = await this.supabase
        .from('vehicles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Mark as pending to ignore realtime duplicate
      this.pendingMutations.set(id, { action: 'update', timestamp: Date.now() });

      // Update with server response
      this.cache.set(id, data);
      this.lastFetchTime = Date.now(); // Reset TTL
      this.emit('change', Array.from(this.cache.values()));

      // Clear pending after 2 seconds (realtime should fire within this window)
      setTimeout(() => this.pendingMutations.delete(id), 2000);

      return data;
    } catch (error) {
      // Rollback: Restore backup
      this.cache.set(id, backup);
      this.emit('change', Array.from(this.cache.values()));
      throw error;
    }
  }

  /**
   * Delete a vehicle (optimistic update)
   */
  async deleteVehicle(id) {
    if (!this.supabase) {
      throw new Error('Cannot delete vehicle: No Supabase client');
    }

    // Backup for rollback
    const backup = this.cache.get(id);
    if (!backup) {
      throw new Error(`Vehicle ${id} not found in cache`);
    }

    // Mark as pending to ignore realtime duplicate
    this.pendingMutations.set(id, { action: 'delete', timestamp: Date.now() });

    // Optimistic: Remove from cache immediately
    this.cache.delete(id);
    this.emit('change', Array.from(this.cache.values()));

    try {
      const { error } = await this.supabase
        .from('vehicles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.lastFetchTime = Date.now(); // Reset TTL
      // No need to emit change again, already done optimistically

      // Clear pending after 2 seconds (realtime should fire within this window)
      setTimeout(() => this.pendingMutations.delete(id), 2000);

      return true;
    } catch (error) {
      // Rollback: Restore deleted vehicle
      this.pendingMutations.delete(id); // Clear pending on error
      this.cache.set(id, backup);
      this.emit('change', Array.from(this.cache.values()));
      throw error;
    }
  }

  /**
   * Check if a vehicle needs refresh (stale data or missing photo)
   * @param {Object} vehicle - Vehicle object
   * @param {number} staleDays - Days before data is considered stale (default 7)
   * @returns {Object} { needsRefresh: boolean, reason: string | null }
   */
  checkNeedsRefresh(vehicle, staleDays = 7) {
    // Missing photo - always refresh
    if (!vehicle.photo_url) {
      return { needsRefresh: true, reason: 'missing_photo' };
    }

    // Never refreshed - refresh
    if (!vehicle.last_refreshed_at) {
      return { needsRefresh: true, reason: 'never_refreshed' };
    }

    // Check staleness
    const lastRefresh = new Date(vehicle.last_refreshed_at);
    const now = new Date();
    const daysSinceRefresh = (now - lastRefresh) / (1000 * 60 * 60 * 24);

    if (daysSinceRefresh > staleDays) {
      return { needsRefresh: true, reason: 'stale_data' };
    }

    return { needsRefresh: false, reason: null };
  }

  /**
   * Refresh a saved vehicle from MarketCheck API
   * Stores previous values for diff tracking
   * @param {string} id - Vehicle ID
   * @param {Object} marketCheckCache - MarketCheck cache instance
   * @param {Object} options - Options { zip, radius }
   * @returns {Object} { vehicle, diff, listingUnavailable }
   */
  async refreshVehicleFromMarketCheck(id, marketCheckCache, options = {}) {
    if (!this.supabase) {
      throw new Error('Cannot refresh vehicle: No Supabase client');
    }

    const vehicle = this.cache.get(id);
    if (!vehicle) {
      throw new Error(`Vehicle ${id} not found in cache`);
    }

    if (!vehicle.vin) {
      throw new Error('Cannot refresh vehicle without VIN');
    }

    // Store previous values for diff tracking
    const previousValues = {
      asking_price: vehicle.asking_price,
      mileage: vehicle.mileage,
      photo_url: vehicle.photo_url,
      dealer_name: vehicle.dealer_name,
      listing_url: vehicle.listing_url
    };

    try {
      // Fetch fresh data from MarketCheck
      const result = await marketCheckCache.getVehicleData(vehicle.vin, {
        zip: options.zip,
        radius: options.radius || 500,
        forceRefresh: true // Force fresh fetch (bypasses client cache)
      });

      if (!result || !result.found) {
        // Listing no longer available
        const updates = {
          last_refreshed_at: new Date().toISOString(),
          previous_asking_price: vehicle.asking_price,
          previous_mileage: vehicle.mileage
        };

        await this.updateVehicle(id, updates);

        return {
          vehicle: this.cache.get(id),
          diff: null,
          listingUnavailable: true
        };
      }

      // Build updates from fresh data
      const payload = result.payload || {};
      const updates = {
        asking_price: payload.asking_price ?? vehicle.asking_price,
        mileage: payload.mileage ?? vehicle.mileage,
        photo_url: payload.photo_url ?? vehicle.photo_url,
        dealer_name: payload.dealer_name ?? vehicle.dealer_name,
        dealer_street: payload.dealer_street ?? vehicle.dealer_street,
        dealer_city: payload.dealer_city ?? vehicle.dealer_city,
        dealer_state: payload.dealer_state ?? vehicle.dealer_state,
        dealer_zip: payload.dealer_zip ?? vehicle.dealer_zip,
        dealer_phone: payload.dealer_phone ?? vehicle.dealer_phone,
        dealer_lat: payload.dealer_lat ?? vehicle.dealer_lat,
        dealer_lng: payload.dealer_lng ?? vehicle.dealer_lng,
        listing_url: payload.listing_url ?? vehicle.listing_url,
        listing_id: payload.listing_id ?? vehicle.listing_id,
        last_refreshed_at: new Date().toISOString(),
        previous_asking_price: vehicle.asking_price,
        previous_mileage: vehicle.mileage,
        marketcheck_payload: result
      };

      // Update vehicle
      await this.updateVehicle(id, updates);

      // Calculate diff
      const diff = {};
      if (previousValues.asking_price != null && updates.asking_price != null &&
          previousValues.asking_price !== updates.asking_price) {
        diff.asking_price = {
          was: previousValues.asking_price,
          now: updates.asking_price,
          change: updates.asking_price - previousValues.asking_price
        };
      }
      if (previousValues.mileage != null && updates.mileage != null &&
          previousValues.mileage !== updates.mileage) {
        diff.mileage = {
          was: previousValues.mileage,
          now: updates.mileage,
          change: updates.mileage - previousValues.mileage
        };
      }
      if (!previousValues.photo_url && updates.photo_url) {
        diff.photo_url = { was: null, now: updates.photo_url };
      }

      return {
        vehicle: this.cache.get(id),
        diff: Object.keys(diff).length > 0 ? diff : null,
        listingUnavailable: false
      };

    } catch (error) {
      console.error('Failed to refresh vehicle:', error);
      throw error;
    }
  }

  /**
   * Subscribe to realtime updates for vehicles table
   * Follows pattern from auth-manager.ts
   * @param {string} userId - User ID for RLS filtering
   * @param {Object} supabaseClient - Optional Supabase client instance (uses window.supabase if not provided)
   */
  subscribe(userId, supabaseClient = null) {
    // Use provided client or fallback to window.supabase
    const client = supabaseClient || window.supabase;

    if (!client || !userId) {
      return;
    }

    // Store the Supabase client instance for use in fetch/mutations
    this.supabase = client;
    this.userId = userId;

    // Check if client has channel method (realtime support)
    if (typeof client.channel !== 'function') {
      return;
    }

    // Unsubscribe existing subscription first
    this.unsubscribe();

    this.subscription = client
      .channel(`saved-vehicles-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'vehicles',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          this._handleRealtimeEvent(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.emit('subscribed');
        } else if (status === 'CHANNEL_ERROR') {
          this.emit('error', new Error('Realtime subscription failed'));
        }
      });
  }

  /**
   * Handle realtime postgres_changes events
   */
  _handleRealtimeEvent(payload) {
    const vehicleId = payload.new?.id || payload.old?.id;

    // Skip if this is a duplicate of a local mutation we just made
    if (vehicleId && this.pendingMutations.has(vehicleId)) {
      const pending = this.pendingMutations.get(vehicleId);
      const eventTypeMap = { INSERT: 'add', UPDATE: 'update', DELETE: 'delete' };

      if (eventTypeMap[payload.eventType] === pending.action) {
        return;
      }
    }

    if (payload.eventType === 'INSERT') {
      // Add new vehicle to cache
      this.cache.set(payload.new.id, payload.new);
      this.lastFetchTime = Date.now(); // Reset TTL
      this.emit('change', Array.from(this.cache.values()));

    } else if (payload.eventType === 'UPDATE') {
      // Update existing vehicle in cache
      if (this.cache.has(payload.new.id)) {
        this.cache.set(payload.new.id, payload.new);
        this.lastFetchTime = Date.now(); // Reset TTL
        this.emit('change', Array.from(this.cache.values()));
      }

    } else if (payload.eventType === 'DELETE') {
      // Remove vehicle from cache
      if (this.cache.has(payload.old.id)) {
        this.cache.delete(payload.old.id);
        this.lastFetchTime = Date.now(); // Reset TTL
        this.emit('change', Array.from(this.cache.values()));
      }
    }
  }

  /**
   * Unsubscribe from realtime updates
   */
  unsubscribe() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  /**
   * Clear cache and reset state
   */
  clear() {
    this.cache.clear();
    this.lastFetchTime = null;
    this.userId = null;
    this.supabase = null;
    this.lastError = null;
    this.unsubscribe();
    this.emit('change', []);
  }

  /**
   * Event emitter: Register listener
   * @param {string} event - Event name ('change', 'error', 'loading', 'subscribed')
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Event emitter: Remove listener
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  /**
   * Event emitter: Emit event
   */
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        // Silent fail on listener error
      }
    });
  }

  /**
   * Get cache stats (for debugging)
   */
  getStats() {
    return {
      size: this.cache.size,
      lastFetchTime: this.lastFetchTime,
      cacheAge: this.lastFetchTime ? Date.now() - this.lastFetchTime : null,
      isFresh: this.lastFetchTime ? (Date.now() - this.lastFetchTime) < this.ttl : false,
      isLoading: this.isLoading,
      isSubscribed: !!this.subscription,
      userId: this.userId,
      lastError: this.lastError
    };
  }
}

// Create singleton instance
const savedVehiclesCache = new SavedVehiclesCache();

// Export to window for global access
window.savedVehiclesCache = savedVehiclesCache;

// Also export for ES6 imports
export default savedVehiclesCache;
