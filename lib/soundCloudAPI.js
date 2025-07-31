// /lib/soundCloudAPI.js
// SoundCloud API integration for fallback audio preview retrieval
// Graceful degradation when Client ID is not configured

class SoundCloudAPI {
  constructor() {
    this.baseURL = 'https://api.soundcloud.com';
    this.clientId = process.env.SOUNDCLOUD_CLIENT_ID;
    this.timeout = 12000; // 12 seconds
    this.maxRetries = 3;
    this.rateLimitDelay = 1500; // 1.5 seconds between requests
    this.lastRequestTime = 0;
    
    // Track configuration status
    this.isConfigured = !!this.clientId;
    
    if (!this.isConfigured) {
      console.log('⚙️ SoundCloud API: Client ID not configured - graceful degradation mode');
    } else {
      console.log('✅ SoundCloud API: Client ID configured');
    }
  }

  /**
   * Search for an artist and get their tracks with preview URLs
   * @param {string} artistName - Name of the artist to search for
   * @param {number} limit - Maximum number of tracks to return (default: 10)
   * @returns {Promise<Object>} Search results with preview URLs
   */
  async searchArtist(artistName, limit = 10) {
    console.log(`☁️ SoundCloud: Searching for artist "${artistName}" (limit: ${limit})`);
    
    // Graceful degradation for missing Client ID
    if (!this.isConfigured) {
      console.log('⚠️ SoundCloud API: Client ID not configured, returning graceful failure');
      return this.getGracefulFailureResponse(artistName, 'SOUNDCLOUD_CLIENT_ID_MISSING');
    }
    
    try {
      // Rate limiting
      await this.enforceRateLimit();
      
      const searchParams = new URLSearchParams({
        q: artistName,
        client_id: this.clientId,
        limit: Math.min(limit, 50),
        linked_partitioning: 1,
        filter: 'streamable' // Only get streamable tracks
      });

      const url = `${this.baseURL}/tracks?${searchParams.toString()}`;
      console.log(`☁️ SoundCloud API URL: ${url.replace(this.clientId, 'CLIENT_ID_HIDDEN')}`);

      const response = await this.makeRequest(url);
      
      if (!response.collection || response.collection.length === 0) {
        console.log(`⚠️ No SoundCloud results found for artist: ${artistName}`);
        return {
          searchSuccess: false,
          artistName: artistName,
          tracks: [],
          totalFound: 0,
          error: 'No tracks found',
          source: 'soundcloud'
        };
      }

      // Filter and process results
      const processedTracks = this.processSearchResults(response.collection, artistName);
      
      console.log(`✅ SoundCloud found ${processedTracks.length} tracks for ${artistName}`);
      
      return {
        searchSuccess: true,
        artistName: artistName,
        tracks: processedTracks,
        totalFound: response.collection.length,
        nextHref: response.next_href,
        source: 'soundcloud',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ SoundCloud search failed for ${artistName}:`, error.message);
      
      // Check if it's an authentication error
      if (error.message.includes('401') || error.message.includes('403')) {
        return this.getGracefulFailureResponse(artistName, 'SOUNDCLOUD_AUTH_ERROR');
      }
      
      return {
        searchSuccess: false,
        artistName: artistName,
        tracks: [],
        totalFound: 0,
        error: error.message,
        source: 'soundcloud',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get stream URL for a specific track
   * @param {number} trackId - SoundCloud track ID
   * @returns {Promise<Object>} Stream URL and track info
   */
  async getTrackStreamUrl(trackId) {
    console.log(`☁️ SoundCloud: Getting stream URL for track ${trackId}`);
    
    if (!this.isConfigured) {
      console.log('⚠️ SoundCloud API: Client ID not configured');
      return {
        success: false,
        trackId: trackId,
        streamUrl: null,
        error: 'SOUNDCLOUD_CLIENT_ID_MISSING',
        source: 'soundcloud'
      };
    }
    
    try {
      await this.enforceRateLimit();
      
      const url = `${this.baseURL}/tracks/${trackId}/stream?client_id=${this.clientId}`;
      
      // For SoundCloud, we need to handle redirects to get the actual stream URL
      const response = await fetch(url, {
        method: 'HEAD', // Use HEAD to get redirect without downloading
        redirect: 'manual'
      });
      
      if (response.status === 302 || response.status === 301) {
        const streamUrl = response.headers.get('location');
        
        return {
          success: true,
          trackId: trackId,
          streamUrl: streamUrl,
          source: 'soundcloud',
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
      
    } catch (error) {
      console.error(`❌ SoundCloud stream URL failed for track ${trackId}:`, error.message);
      
      return {
        success: false,
        trackId: trackId,
        streamUrl: null,
        error: error.message,
        source: 'soundcloud',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Process SoundCloud search results and extract relevant track information
   * @param {Array} tracks - Raw SoundCloud API results
   * @param {string} artistName - Original artist name for filtering
   * @returns {Array} Processed track objects
   */
  processSearchResults(tracks, artistName) {
    return tracks
      .filter(track => {
        // Filter for tracks that actually belong to the searched artist
        const trackUser = track.user?.username?.toLowerCase() || '';
        const trackTitle = track.title?.toLowerCase() || '';
        const searchArtist = artistName.toLowerCase();
        
        // Check if artist names match or artist is mentioned in title
        return trackUser.includes(searchArtist) || 
               searchArtist.includes(trackUser) ||
               trackTitle.includes(searchArtist);
      })
      .filter(track => {
        // Only include streamable tracks
        return track.streamable && track.policy === 'ALLOW';
      })
      .map(track => ({
        trackId: track.id,
        trackName: track.title,
        artistName: track.user?.username || artistName,
        description: track.description,
        genre: track.genre,
        releaseDate: track.created_at,
        duration: track.duration,
        streamUrl: track.stream_url,
        permalinkUrl: track.permalink_url,
        artworkUrl: track.artwork_url,
        playbackCount: track.playback_count,
        likesCount: track.likes_count,
        downloadable: track.downloadable,
        // Additional metadata
        metadata: {
          waveformUrl: track.waveform_url,
          tagList: track.tag_list,
          bpm: track.bpm,
          key: track.key_signature,
          isrc: track.isrc,
          license: track.license
        }
      }))
      .slice(0, 15); // Limit to top 15 tracks for performance
  }

  /**
   * Get graceful failure response when Client ID is missing
   * @param {string} artistName - Artist name that was searched
   * @param {string} errorCode - Specific error code
   * @returns {Object} Graceful failure response
   */
  getGracefulFailureResponse(artistName, errorCode) {
    const errorMessages = {
      'SOUNDCLOUD_CLIENT_ID_MISSING': 'SoundCloud Client ID not configured - add SOUNDCLOUD_CLIENT_ID environment variable',
      'SOUNDCLOUD_AUTH_ERROR': 'SoundCloud authentication failed - check Client ID validity',
      'SOUNDCLOUD_RATE_LIMITED': 'SoundCloud API rate limit exceeded - try again later'
    };
    
    return {
      searchSuccess: false,
      artistName: artistName,
      tracks: [],
      totalFound: 0,
      error: errorMessages[errorCode] || 'SoundCloud API error',
      errorCode: errorCode,
      source: 'soundcloud_graceful_failure',
      configRequired: errorCode === 'SOUNDCLOUD_CLIENT_ID_MISSING',
      timestamp: new Date().toISOString(),
      gracefulDegradation: true
    };
  }

  /**
   * Check SoundCloud API status and configuration
   * @returns {Promise<Object>} Service status
   */
  async getStatus() {
    console.log('☁️ Checking SoundCloud API status...');
    
    if (!this.isConfigured) {
      return {
        service: 'soundcloud',
        status: 'not_configured',
        available: false,
        lastChecked: new Date().toISOString(),
        error: 'SOUNDCLOUD_CLIENT_ID not configured',
        configRequired: true,
        gracefulDegradation: true
      };
    }
    
    try {
      // Test with a simple API call
      const testUrl = `${this.baseURL}/resolve?url=https://soundcloud.com/soundcloud&client_id=${this.clientId}`;
      const response = await this.makeRequest(testUrl);
      
      const status = {
        service: 'soundcloud',
        status: 'operational',
        available: true,
        lastChecked: new Date().toISOString(),
        clientIdConfigured: true,
        testResponse: response ? 'success' : 'failed'
      };
      
      console.log(`☁️ SoundCloud API status: ${status.status}`);
      return status;
      
    } catch (error) {
      console.error('❌ SoundCloud status check failed:', error.message);
      
      // Determine error type
      let status = 'error';
      let errorCode = null;
      
      if (error.message.includes('401') || error.message.includes('403')) {
        status = 'auth_error';
        errorCode = 'SOUNDCLOUD_AUTH_ERROR';
      } else if (error.message.includes('429')) {
        status = 'rate_limited';
        errorCode = 'SOUNDCLOUD_RATE_LIMITED';
      }
      
      return {
        service: 'soundcloud',
        status: status,
        available: false,
        lastChecked: new Date().toISOString(),
        error: error.message,
        errorCode: errorCode,
        clientIdConfigured: true
      };
    }
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

