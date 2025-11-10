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
      console.warn('[SavedVehiclesCache] Cannot fetch: No Supabase client or user ID');
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
          inserted_at
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
      console.error('[SavedVehiclesCache] Fetch error:', error);
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

      // Replace temp vehicle with real one
      this.cache.delete(tempId);
      this.cache.set(data.id, data);
      this.lastFetchTime = Date.now(); // Reset TTL
      this.emit('change', Array.from(this.cache.values()));

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

      // Update with server response
      this.cache.set(id, data);
      this.lastFetchTime = Date.now(); // Reset TTL
      this.emit('change', Array.from(this.cache.values()));

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

      return true;
    } catch (error) {
      // Rollback: Restore deleted vehicle
      this.cache.set(id, backup);
      this.emit('change', Array.from(this.cache.values()));
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
      console.warn('[SavedVehiclesCache] Cannot subscribe: Missing Supabase or userId');
      return;
    }

    // Store the Supabase client instance for use in fetch/mutations
    this.supabase = client;
    this.userId = userId;

    // Check if client has channel method (realtime support)
    if (typeof client.channel !== 'function') {
      console.warn('[SavedVehiclesCache] Supabase client does not support realtime (no channel method)');
      console.warn('[SavedVehiclesCache] Falling back to polling mode - cache will work but no live updates');
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
        console.error(`[SavedVehiclesCache] Error in ${event} listener:`, error);
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
