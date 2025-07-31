// /lib/appleITunesAPI.js
// Apple iTunes Search API integration for audio preview retrieval
// No authentication required - public API

class AppleITunesAPI {
  constructor() {
    this.baseURL = 'https://itunes.apple.com/search';
    this.timeout = 10000; // 10 seconds
    this.maxRetries = 3;
  }

  /**
   * Search for an artist and get their top tracks with preview URLs
   * @param {string} artistName - Name of the artist to search for
   * @param {number} limit - Maximum number of tracks to return (default: 10)
   * @returns {Promise<Object>} Search results with preview URLs
   */
  async searchArtist(artistName, limit = 10) {
    console.log(`🍎 Apple iTunes: Searching for artist "${artistName}" (limit: ${limit})`);
    
    try {
      const searchParams = new URLSearchParams({
        term: artistName,
        media: 'music',
        entity: 'song',
        attribute: 'artistTerm',
        limit: Math.min(limit, 50), // iTunes API max is 200, but we limit to 50 for performance
        country: 'US', // Use US store for better coverage
        explicit: 'Yes' // Include explicit content
      });

      const url = `${this.baseURL}?${searchParams.toString()}`;
      console.log(`🍎 iTunes API URL: ${url}`);

      const response = await this.makeRequest(url);
      
      if (!response.results || response.results.length === 0) {
        console.log(`⚠️ No iTunes results found for artist: ${artistName}`);
        return {
          searchSuccess: false,
          artistName: artistName,
          tracks: [],
          totalFound: 0,
          error: 'No tracks found',
          source: 'apple_itunes'
        };
      }

      // Filter and process results
      const processedTracks = this.processSearchResults(response.results, artistName);
      
      console.log(`✅ iTunes found ${processedTracks.length} tracks for ${artistName}`);
      
      return {
        searchSuccess: true,
        artistName: artistName,
        tracks: processedTracks,
        totalFound: response.resultCount || processedTracks.length,
        source: 'apple_itunes',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ iTunes search failed for ${artistName}:`, error.message);
      
      return {
        searchSuccess: false,
        artistName: artistName,
        tracks: [],
        totalFound: 0,
        error: error.message,
        source: 'apple_itunes',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Process iTunes search results and extract relevant track information
   * @param {Array} results - Raw iTunes API results
   * @param {string} artistName - Original artist name for filtering
   * @returns {Array} Processed track objects
   */
  processSearchResults(results, artistName) {
    return results
      .filter(track => {
        // Filter for tracks that actually belong to the searched artist
        const trackArtist = track.artistName?.toLowerCase() || '';
        const searchArtist = artistName.toLowerCase();
        
        // Check if artist names match (allowing for slight variations)
        return trackArtist.includes(searchArtist) || searchArtist.includes(trackArtist);
      })
      .filter(track => {
        // Only include tracks with preview URLs
        return track.previewUrl && track.previewUrl.length > 0;
      })
      .map(track => ({
        trackId: track.trackId,
        trackName: track.trackName,
        artistName: track.artistName,
        albumName: track.collectionName,
        genre: track.primaryGenreName,
        releaseDate: track.releaseDate,
        duration: track.trackTimeMillis,
        previewUrl: track.previewUrl,
        artworkUrl: track.artworkUrl100,
        trackPrice: track.trackPrice,
        currency: track.currency,
        country: track.country,
        explicit: track.trackExplicitness === 'explicit',
        // Additional metadata for audio analysis
        metadata: {
          collectionId: track.collectionId,
          trackNumber: track.trackNumber,
          discNumber: track.discNumber,
          isStreamable: track.isStreamable
        }
      }))
      .slice(0, 15); // Limit to top 15 tracks for performance
  }

  /**
   * Get specific track by iTunes track ID
   * @param {number} trackId - iTunes track ID
   * @returns {Promise<Object>} Track details
   */
  async getTrackById(trackId) {
    console.log(`🍎 iTunes: Getting track by ID ${trackId}`);
    
    try {
      const url = `https://itunes.apple.com/lookup?id=${trackId}`;
      const response = await this.makeRequest(url);
      
      if (!response.results || response.results.length === 0) {
        throw new Error(`Track not found: ${trackId}`);
      }
      
      const track = response.results[0];
      return this.processSearchResults([track], track.artistName)[0];
      
    } catch (error) {
      console.error(`❌ iTunes track lookup failed for ID ${trackId}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if Apple iTunes API is available
   * @returns {Promise<Object>} Service status
   */
  async getStatus() {
    console.log('🍎 Checking iTunes API status...');
    
    try {
      // Test with a known artist
      const testResult = await this.searchArtist('Deadmau5', 1);
      
      const status = {
        service: 'apple_itunes',
        status: testResult.searchSuccess ? 'operational' : 'error',
        available: testResult.searchSuccess,
        lastChecked: new Date().toISOString(),
        responseTime: null,
        error: testResult.error || null
      };
      
      console.log(`🍎 iTunes API status: ${status.status}`);
      return status;
      
    } catch (error) {
      console.error('❌ iTunes API status check failed:', error.message);
      
      return {
        service: 'apple_itunes',
        status: 'error',
        available: false,
        lastChecked: new Date().toISOString(),
        error: error.message
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
        console.log(`🍎 iTunes API request attempt ${attempt}/${this.maxRetries}`);
        
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
        console.log(`✅ iTunes API request successful (attempt ${attempt})`);
        
        return data;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ iTunes API attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          console.log(`⏳ Retrying iTunes API in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`iTunes API failed after ${this.maxRetries} attempts: ${lastError.message}`);
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
    
    // Check maximum length (iTunes has practical limits)
    if (trimmed.length > 100) {
      return false;
    }
    
    // Check for valid characters (allow most Unicode characters)
    const invalidChars = /[<>{}[\]\\]/;
    if (invalidChars.test(trimmed)) {
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
      service: 'apple_itunes',
      baseURL: this.baseURL,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      authRequired: false,
      rateLimit: 'None specified by Apple',
      features: [
        'Artist search',
        'Track preview URLs',
        'Album artwork',
        'Genre information',
        'Release dates',
        'Track metadata'
      ]
    };
  }
}

module.exports = AppleITunesAPI;

