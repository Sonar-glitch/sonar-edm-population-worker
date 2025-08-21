// /lib/soundCloudAPI.js
// SoundCloud API integration for fallback audio preview retrieval
// Graceful degradation when Client ID is not configured

class SoundCloudAPI {
  constructor() {
    // SoundCloud support removed from active preview acquisition flows.
    // This stub preserves the class interface so imports don't break, and
    // returns graceful failure responses. Do not perform live SoundCloud calls.
    this.isConfigured = false;
    console.log('⚠️ SoundCloudAPI stub initialized: SoundCloud integration removed');
  }

  async searchArtist(artistName, limit = 10) {
    return this.getGracefulFailureResponse(artistName, 'SOUNDCLOUD_REMOVED');
  }

  /**
   * Get stream URL for a specific track
   * @param {number} trackId - SoundCloud track ID
   * @returns {Promise<Object>} Stream URL and track info
   */
  async getTrackStreamUrl(trackId) {
    return {
      success: false,
      trackId,
      streamUrl: null,
      error: 'SOUNDCLOUD_REMOVED',
      source: 'soundcloud_stub'
    };
  }

  /**
   * Process SoundCloud search results and extract relevant track information
   * @param {Array} tracks - Raw SoundCloud API results
   * @param {string} artistName - Original artist name for filtering
   * @returns {Array} Processed track objects
   */
  processSearchResults() {
    return [];
  }

  /**
   * Get graceful failure response when Client ID is missing
   * @param {string} artistName - Artist name that was searched
   * @param {string} errorCode - Specific error code
   * @returns {Object} Graceful failure response
   */
  getGracefulFailureResponse(artistName, errorCode) {
    return {
      searchSuccess: false,
      artistName,
      tracks: [],
      totalFound: 0,
      error: 'SoundCloud integration removed',
      errorCode: errorCode || 'SOUNDCLOUD_REMOVED',
      source: 'soundcloud_stub',
      configRequired: false,
      timestamp: new Date().toISOString(),
      gracefulDegradation: true
    };
  }

  /**
   * Check SoundCloud API status and configuration
   * @returns {Promise<Object>} Service status
   */
  async getStatus() {
    return {
      service: 'soundcloud',
      status: 'removed',
      available: false,
      lastChecked: new Date().toISOString(),
      error: 'SoundCloud integration removed',
      configRequired: false
    };
  }

  /**
   * Make HTTP request with retry logic and timeout
   * @param {string} url - URL to request
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(url) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`☁️ SoundCloud API request attempt ${attempt}/${this.maxRetries}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'TIKO-Audio-Analysis/1.0',
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`✅ SoundCloud API request successful (attempt ${attempt})`);
        
        return data;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ SoundCloud API attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.maxRetries) {
          const delay = Math.min(1500 * Math.pow(2, attempt - 1), 6000); // Exponential backoff, max 6s
          console.log(`⏳ Retrying SoundCloud API in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`SoundCloud API failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Enforce rate limiting between requests
   * @returns {Promise<void>}
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      console.log(`⏳ SoundCloud rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Validate artist name for search
   * @param {string} artistName - Artist name to validate
   * @returns {boolean} Whether the artist name is valid
   */
  validateArtistName(artistName) {
    if (!artistName || typeof artistName !== 'string') {
      return false;
    }
    
    const trimmed = artistName.trim();
    
    // Check minimum length
    if (trimmed.length < 1) {
      return false;
    }
    
    // Check maximum length (SoundCloud has practical limits)
    if (trimmed.length > 100) {
      return false;
    }
    
    return true;
  }

  /**
   * Get metrics for monitoring
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      service: 'soundcloud',
      baseURL: this.baseURL,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      rateLimitDelay: this.rateLimitDelay,
      isConfigured: this.isConfigured,
      authRequired: true,
      gracefulDegradation: true,
      features: [
        'Artist search',
        'Track streaming URLs',
        'Track metadata',
        'Playback statistics',
        'Genre information',
        'BPM and key data',
        'Graceful degradation'
      ],
      configurationStatus: {
        clientIdConfigured: this.isConfigured,
        environmentVariable: 'SOUNDCLOUD_CLIENT_ID',
        required: false, // Optional fallback service
        gracefulFailure: true
      }
    };
  }
}

module.exports = SoundCloudAPI;

