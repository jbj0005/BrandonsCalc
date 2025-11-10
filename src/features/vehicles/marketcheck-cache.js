/**
 * MarketCheckCache - Client-side cache for MarketCheck API responses
 *
 * Features:
 * - Map-based O(1) lookup by VIN
 * - TTL-based cache freshness (5 minutes default)
 * - Request deduplication for concurrent VIN lookups
 * - EventEmitter pattern for reactive UI updates
 * - Works with 3-layer caching: Client (this) → Server Memory → Database
 *
 * Cache Strategy:
 * - Layer 1 (Client): 5-minute TTL, instant response from memory
 * - Layer 2 (Server): 5-minute TTL, <50ms response from NodeCache
 * - Layer 3 (Database): 7-30 day TTL, shared across users
 */

class MarketCheckCache {
  constructor() {
    // Map<vin, { response, timestamp }> for O(1) lookups
    this.cache = new Map();

    // Cache TTL: 5 minutes (matches server memory cache)
    this.ttl = 5 * 60 * 1000; // 300,000ms

    // Active fetch promises for request deduplication
    // Map<vin, Promise>
    this.activeFetches = new Map();

    // Event listeners: { 'change': [fn1, fn2], 'error': [fn3] }
    this.listeners = {};
  }

  /**
   * Get MarketCheck data for a VIN
   * @param {string} vin - Vehicle Identification Number
   * @param {Object} options
   * @param {boolean} options.forceRefresh - Skip cache and force fresh lookup
   * @param {string} options.zip - ZIP code for location-based search
   * @param {number} options.radius - Search radius in miles
   * @param {string} options.pick - 'nearest' or 'freshest'
   * @returns {Promise<Object>} MarketCheck response
   */
  async getVehicleData(vin, options = {}) {
    const { forceRefresh = false, zip = '', radius = 100, pick = 'nearest' } = options;

    // Normalize VIN
    const normalizedVIN = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');

    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(normalizedVIN)) {
      throw new Error('Invalid VIN format');
    }

    // Check cache if not forcing refresh
    if (!forceRefresh) {
      const cached = this.cache.get(normalizedVIN);
      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < this.ttl) {
          return cached.response;
        } else {
          this.cache.delete(normalizedVIN);
        }
      }
    }

    // Deduplicate concurrent requests
    if (this.activeFetches.has(normalizedVIN)) {
      return this.activeFetches.get(normalizedVIN);
    }

    // Create new fetch promise
    const fetchPromise = this._fetchFromServer(normalizedVIN, { zip, radius, pick });
    this.activeFetches.set(normalizedVIN, fetchPromise);

    try {
      const response = await fetchPromise;

      // Cache the response
      this.cache.set(normalizedVIN, {
        response,
        timestamp: Date.now()
      });

      this.emit('change', { vin: normalizedVIN, response });

      return response;
    } catch (error) {
      console.error(`[MarketCheckCache] Fetch failed for VIN: ${normalizedVIN}`, error);
      this.emit('error', { vin: normalizedVIN, error });
      throw error;
    } finally {
      this.activeFetches.delete(normalizedVIN);
    }
  }

  /**
   * Fetch vehicle data from server (private method)
   * Server will check its own cache layers (memory + database)
   */
  async _fetchFromServer(vin, options) {
    const { zip, radius, pick } = options;
    const params = new URLSearchParams();

    if (zip) params.append('zip', zip);
    if (radius) params.append('radius', radius);
    if (pick) params.append('pick', pick);

    const url = `/api/mc/by-vin/${vin}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get cached data for a VIN (synchronous, no fetch)
   * Returns null if not cached or expired
   */
  getCached(vin) {
    const normalizedVIN = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const cached = this.cache.get(normalizedVIN);

    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age >= this.ttl) {
      this.cache.delete(normalizedVIN);
      return null;
    }

    return cached.response;
  }

  /**
   * Check if VIN is cached and fresh
   */
  isCached(vin) {
    return this.getCached(vin) !== null;
  }

  /**
   * Clear cache for a specific VIN or all VINs
   */
  clear(vin = null) {
    if (vin) {
      const normalizedVIN = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
      this.cache.delete(normalizedVIN);
    } else {
      this.cache.clear();
    }
    this.emit('change', { cleared: true, vin });
  }

  /**
   * Get cache statistics (for debugging)
   */
  getStats() {
    const entries = Array.from(this.cache.entries()).map(([vin, data]) => ({
      vin,
      age: Date.now() - data.timestamp,
      fresh: (Date.now() - data.timestamp) < this.ttl
    }));

    return {
      size: this.cache.size,
      ttl: this.ttl,
      entries,
      activeFetches: this.activeFetches.size
    };
  }

  /**
   * Event emitter: Register listener
   * @param {string} event - Event name ('change', 'error')
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
        console.error(`[MarketCheckCache] Error in ${event} listener:`, error);
      }
    });
  }
}

// Create singleton instance
const marketCheckCache = new MarketCheckCache();

// Export to window for global access
window.marketCheckCache = marketCheckCache;

// Also export for ES6 imports
export default marketCheckCache;
