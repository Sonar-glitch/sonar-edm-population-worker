// Real Data Audio Features Service - UPDATED
// Fetches live audio features from ReccoBeats API with authorization support
// Intelligent fallback to genre-based estimates when API unavailable
// All data sources labeled with freshness indicators and error codes

const fetch = require('node-fetch');

class AudioFeaturesService {
  constructor() {
    this.baseUrl = 'https://api.reccobeats.com';
    
    // API Configuration with authorization support
    this.apiKey = process.env.RECCOBEATS_API_KEY || null;
    this.apiEnabled = this.apiKey !== null;
    
    this.cache = new Map(); // In-memory cache for audio features
    this.artistCache = new Map(); // Cache for artist search results
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    
    // Rate limiting
    this.lastRequestTime = 0;
    this.minRequestInterval = 200; // 200ms between requests
    
    // Statistics for monitoring
    this.stats = {
      totalRequests: 0,
      liveDataFetches: 0,
      fallbackUsages: 0,
      errors: 0,
      authErrors: 0,
      lastError: null,
      lastErrorCode: null,
      lastSuccessfulFetch: null,
      apiKeyConfigured: this.apiEnabled
    };

    // Genre-based fallback data with confidence scores
    this.genreAudioFeatures = new Map([
      // EDM Genres (high confidence)
      ['techno', { 
        energy: 0.85, danceability: 0.90, valence: 0.30, tempo: 130, 
        acousticness: 0.05, instrumentalness: 0.85, speechiness: 0.05,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['house', { 
        energy: 0.80, danceability: 0.95, valence: 0.60, tempo: 125, 
        acousticness: 0.10, instrumentalness: 0.70, speechiness: 0.10,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['deep house', { 
        energy: 0.65, danceability: 0.85, valence: 0.55, tempo: 122, 
        acousticness: 0.15, instrumentalness: 0.75, speechiness: 0.08,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['tech house', { 
        energy: 0.75, danceability: 0.90, valence: 0.45, tempo: 126, 
        acousticness: 0.08, instrumentalness: 0.80, speechiness: 0.06,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['progressive house', { 
        energy: 0.75, danceability: 0.85, valence: 0.55, tempo: 128, 
        acousticness: 0.15, instrumentalness: 0.75, speechiness: 0.08,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['electro house', { 
        energy: 0.90, danceability: 0.95, valence: 0.70, tempo: 128, 
        acousticness: 0.05, instrumentalness: 0.65, speechiness: 0.10,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['big room', { 
        energy: 0.95, danceability: 0.90, valence: 0.75, tempo: 128, 
        acousticness: 0.03, instrumentalness: 0.80, speechiness: 0.05,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['future house', { 
        energy: 0.85, danceability: 0.92, valence: 0.65, tempo: 126, 
        acousticness: 0.08, instrumentalness: 0.70, speechiness: 0.08,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['trance', { 
        energy: 0.80, danceability: 0.80, valence: 0.60, tempo: 132, 
        acousticness: 0.10, instrumentalness: 0.85, speechiness: 0.05,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['dubstep', { 
        energy: 0.90, danceability: 0.85, valence: 0.40, tempo: 140, 
        acousticness: 0.05, instrumentalness: 0.80, speechiness: 0.05,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['drum and bass', { 
        energy: 0.95, danceability: 0.90, valence: 0.50, tempo: 175, 
        acousticness: 0.03, instrumentalness: 0.85, speechiness: 0.05,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['dnb', { 
        energy: 0.95, danceability: 0.90, valence: 0.50, tempo: 175, 
        acousticness: 0.03, instrumentalness: 0.85, speechiness: 0.05,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['hardstyle', { 
        energy: 0.95, danceability: 0.85, valence: 0.60, tempo: 150, 
        acousticness: 0.02, instrumentalness: 0.80, speechiness: 0.05,
        confidence: 0.75, source: 'genre_based_fallback'
      }],
      ['trap', { 
        energy: 0.85, danceability: 0.80, valence: 0.45, tempo: 140, 
        acousticness: 0.05, instrumentalness: 0.60, speechiness: 0.15,
        confidence: 0.70, source: 'genre_based_fallback'
      }],
      ['ambient', { 
        energy: 0.30, danceability: 0.40, valence: 0.50, tempo: 90, 
        acousticness: 0.40, instrumentalness: 0.90, speechiness: 0.05,
        confidence: 0.70, source: 'genre_based_fallback'
      }],
      ['electronic', { 
        energy: 0.70, danceability: 0.75, valence: 0.55, tempo: 120, 
        acousticness: 0.20, instrumentalness: 0.70, speechiness: 0.10,
        confidence: 0.65, source: 'genre_based_fallback'
      }],
      ['dance', { 
        energy: 0.80, danceability: 0.90, valence: 0.70, tempo: 125, 
        acousticness: 0.15, instrumentalness: 0.60, speechiness: 0.10,
        confidence: 0.65, source: 'genre_based_fallback'
      }],
      ['edm', { 
        energy: 0.85, danceability: 0.90, valence: 0.65, tempo: 128, 
        acousticness: 0.10, instrumentalness: 0.70, speechiness: 0.08,
        confidence: 0.70, source: 'genre_based_fallback'
      }],
      
      // Non-EDM Genres (medium confidence)
      ['hip hop', { 
        energy: 0.70, danceability: 0.80, valence: 0.60, tempo: 95, 
        acousticness: 0.15, instrumentalness: 0.20, speechiness: 0.30,
        confidence: 0.60, source: 'genre_based_fallback'
      }],
      ['jazz', { 
        energy: 0.50, danceability: 0.60, valence: 0.65, tempo: 110, 
        acousticness: 0.60, instrumentalness: 0.70, speechiness: 0.05,
        confidence: 0.60, source: 'genre_based_fallback'
      }],
      ['rock', { 
        energy: 0.80, danceability: 0.60, valence: 0.70, tempo: 120, 
        acousticness: 0.30, instrumentalness: 0.40, speechiness: 0.10,
        confidence: 0.60, source: 'genre_based_fallback'
      }],
      ['pop', { 
        energy: 0.70, danceability: 0.75, valence: 0.75, tempo: 115, 
        acousticness: 0.25, instrumentalness: 0.30, speechiness: 0.15,
        confidence: 0.60, source: 'genre_based_fallback'
      }],
      ['country', { 
        energy: 0.60, danceability: 0.65, valence: 0.70, tempo: 105, 
        acousticness: 0.50, instrumentalness: 0.40, speechiness: 0.20,
        confidence: 0.55, source: 'genre_based_fallback'
      }],
      ['folk', { 
        energy: 0.45, danceability: 0.50, valence: 0.65, tempo: 100, 
        acousticness: 0.70, instrumentalness: 0.50, speechiness: 0.15,
        confidence: 0.55, source: 'genre_based_fallback'
      }],
      ['classical', { 
        energy: 0.40, danceability: 0.30, valence: 0.60, tempo: 80, 
        acousticness: 0.80, instrumentalness: 0.95, speechiness: 0.02,
        confidence: 0.60, source: 'genre_based_fallback'
      }],
      
      // Unknown fallback (low confidence)
      ['unknown', { 
        energy: 0.60, danceability: 0.65, valence: 0.55, tempo: 120, 
        acousticness: 0.30, instrumentalness: 0.50, speechiness: 0.15,
        confidence: 0.30, source: 'genre_based_fallback'
      }]
    ]);

    // Representative tracks for known artists (for API calls)
    this.representativeTracks = new Map([
      ['deadmau5', 'Strobe'],
      ['calvin harris', 'Feel So Close'],
      ['tiësto', 'Adagio for Strings'],
      ['david guetta', 'Titanium'],
      ['martin garrix', 'Animals'],
      ['skrillex', 'Bangarang'],
      ['armin van buuren', 'Shivers'],
      ['above & beyond', 'Sun & Moon'],
      ['eric prydz', 'Opus'],
      ['charlotte de witte', 'Doppler'],
      ['amelie lens', 'Higher'],
      ['solomun', 'Kackvogel'],
      ['carl cox', 'I Want You'],
      ['richie hawtin', 'Spastik'],
      ['nina kraviz', 'Ghetto Kraviz']
    ]);

    // Log initialization status
    if (this.apiEnabled) {
      console.log('🎵 AudioFeaturesService: ReccoBeats API enabled with authorization');
    } else {
      console.log('🎵 AudioFeaturesService: Using genre-based fallback (no API key configured)');
    }
  }

  // Rate limiting helper
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  // Get audio features for event (main entry point)
  async getEventAudioFeatures(event) {
    this.stats.totalRequests++;
    
    // If API key not configured, go straight to fallback
    if (!this.apiEnabled) {
      this.stats.fallbackUsages++;
      return this.getFallbackAudioFeatures(event, 'API_KEY_NOT_CONFIGURED');
    }
    
    try {
      // Try to get live data from ReccoBeats API
      const liveData = await this.fetchLiveAudioFeatures(event);
      if (liveData.success) {
        this.stats.liveDataFetches++;
        this.stats.lastSuccessfulFetch = new Date();
        return {
          ...liveData.audioFeatures,
          source: 'reccobeats_live',
          dataFreshness: new Date(),
          confidence: liveData.confidence || 0.85,
          errorCode: null
        };
      }
    } catch (error) {
      this.stats.errors++;
      
      // Track authorization errors separately
      if (error.message.includes('401') || error.message.includes('Unauthorized') || 
          error.message.includes('403') || error.message.includes('Forbidden')) {
        this.stats.authErrors++;
        this.stats.lastErrorCode = 'API_UNAUTHORIZED';
      } else {
        this.stats.lastErrorCode = error.code || 'API_ERROR';
      }
      
      this.stats.lastError = error.message;
      console.warn(`ReccoBeats API failed for ${event.name}:`, error.message);
    }

    // Fallback to genre-based estimation
    this.stats.fallbackUsages++;
    return this.getFallbackAudioFeatures(event, this.stats.lastErrorCode);
  }

  // Fetch live audio features from ReccoBeats API
  async fetchLiveAudioFeatures(event) {
    if (!event.artists || event.artists.length === 0) {
      throw new Error('No artists available for audio features lookup');
    }

    const primaryArtist = event.artists[0];
    const cacheKey = `live_${primaryArtist.toLowerCase()}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return {
          success: true,
          audioFeatures: cached.data,
          confidence: cached.confidence,
          source: 'reccobeats_cached'
        };
      }
    }

    // Search for artist
    await this.waitForRateLimit();
    const artistSearchResult = await this.searchArtist(primaryArtist);
    
    if (!artistSearchResult.success) {
      throw new Error(`Artist not found: ${primaryArtist} (${artistSearchResult.error})`);
    }

    // Get artist tracks
    await this.waitForRateLimit();
    const tracksResult = await this.getArtistTracks(artistSearchResult.artistId);
    
    if (!tracksResult.success || tracksResult.tracks.length === 0) {
      throw new Error(`No tracks found for artist: ${primaryArtist}`);
    }

    // Get audio features for representative track
    const representativeTrack = this.selectRepresentativeTrack(primaryArtist, tracksResult.tracks);
    
    await this.waitForRateLimit();
    const audioFeaturesResult = await this.getTrackAudioFeatures(representativeTrack.id);
    
    if (!audioFeaturesResult.success) {
      throw new Error(`Audio features not available for track: ${representativeTrack.name}`);
    }

    // Cache the result
    this.cache.set(cacheKey, {
      data: audioFeaturesResult.audioFeatures,
      confidence: audioFeaturesResult.confidence,
      timestamp: Date.now()
    });

    return {
      success: true,
      audioFeatures: audioFeaturesResult.audioFeatures,
      confidence: audioFeaturesResult.confidence || 0.85
    };
  }

  // Search for artist by name
  async searchArtist(artistName) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'TIKO-Sound-Characteristics/2.0'
      };

      // Add authorization header if API key is configured
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        // Alternative auth methods in case Bearer doesn't work:
        // headers['X-API-Key'] = this.apiKey;
        // headers['ApiKey'] = this.apiKey;
      }

      const response = await fetch(`${this.baseUrl}/search/artist?q=${encodeURIComponent(artistName)}`, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.artists || data.artists.length === 0) {
        return { success: false, error: 'Artist not found in ReccoBeats database' };
      }

      return {
        success: true,
        artistId: data.artists[0].id,
        artistName: data.artists[0].name
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        errorCode: error.message.includes('401') ? 'UNAUTHORIZED' : 'SEARCH_FAILED'
      };
    }
  }

  // Get tracks for artist
  async getArtistTracks(artistId) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'TIKO-Sound-Characteristics/2.0'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/artist/${artistId}/tracks`, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        tracks: data.tracks || []
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        errorCode: error.message.includes('401') ? 'UNAUTHORIZED' : 'TRACKS_FETCH_FAILED'
      };
    }
  }

  // Get audio features for track
  async getTrackAudioFeatures(trackId) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'TIKO-Sound-Characteristics/2.0'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/track/${trackId}/audio-features`, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Validate audio features data
      const requiredFields = ['energy', 'danceability', 'valence', 'tempo'];
      const missingFields = requiredFields.filter(field => data[field] === undefined);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing audio features: ${missingFields.join(', ')}`);
      }

      return {
        success: true,
        audioFeatures: {
          energy: data.energy,
          danceability: data.danceability,
          valence: data.valence,
          tempo: data.tempo,
          acousticness: data.acousticness || 0.1,
          instrumentalness: data.instrumentalness || 0.5,
          speechiness: data.speechiness || 0.1
        },
        confidence: 0.90 // High confidence for live API data
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        errorCode: error.message.includes('401') ? 'UNAUTHORIZED' : 'AUDIO_FEATURES_FAILED'
      };
    }
  }

  // Select representative track for artist
  selectRepresentativeTrack(artistName, tracks) {
    const normalizedArtist = artistName.toLowerCase();
    
    // Try to find known representative track
    const knownTrack = this.representativeTracks.get(normalizedArtist);
    if (knownTrack) {
      const foundTrack = tracks.find(track => 
        track.name.toLowerCase().includes(knownTrack.toLowerCase())
      );
      if (foundTrack) return foundTrack;
    }
    
    // Fallback to first track
    return tracks[0];
  }

  // Get fallback audio features based on genre
  getFallbackAudioFeatures(event, errorCode = null) {
    const primaryGenre = event.primaryGenre || 'unknown';
    const fallbackData = this.genreAudioFeatures.get(primaryGenre.toLowerCase()) || 
                        this.genreAudioFeatures.get('unknown');

    return {
      ...fallbackData,
      dataFreshness: new Date(),
      errorCode: errorCode,
      errorMessage: this.stats.lastError
    };
  }

  // Get service statistics with real-time data
  getStats() {
    const successRate = this.stats.totalRequests > 0 
      ? Math.round((this.stats.liveDataFetches / this.stats.totalRequests) * 100)
      : 0;

    const authErrorRate = this.stats.totalRequests > 0 
      ? Math.round((this.stats.authErrors / this.stats.totalRequests) * 100)
      : 0;

    return {
      totalRequests: this.stats.totalRequests,
      liveDataFetches: this.stats.liveDataFetches,
      fallbackUsages: this.stats.fallbackUsages,
      errors: this.stats.errors,
      authErrors: this.stats.authErrors,
      successRate: successRate,
      authErrorRate: authErrorRate,
      lastError: this.stats.lastError,
      lastErrorCode: this.stats.lastErrorCode,
      lastSuccessfulFetch: this.stats.lastSuccessfulFetch,
      cacheSize: this.cache.size,
      apiKeyConfigured: this.stats.apiKeyConfigured,
      apiEnabled: this.apiEnabled
    };
  }

  // Clear cache (for testing/debugging)
  clearCache() {
    this.cache.clear();
    this.artistCache.clear();
  }

  // Get data freshness indicator for UI
  getDataFreshnessIndicator(audioFeatures) {
    if (!audioFeatures.dataFreshness) {
      return {
        label: 'Unknown freshness',
        tooltip: 'Data freshness information not available',
        status: 'unknown'
      };
    }

    const now = new Date();
    const dataAge = now - new Date(audioFeatures.dataFreshness);
    const minutesOld = Math.floor(dataAge / (1000 * 60));
    const hoursOld = Math.floor(dataAge / (1000 * 60 * 60));

    let label, tooltip, status;

    if (audioFeatures.source === 'reccobeats_live') {
      if (minutesOld < 5) {
        label = 'Live';
        tooltip = `Fetched ${minutesOld} minute(s) ago from ReccoBeats API`;
        status = 'live';
      } else if (hoursOld < 1) {
        label = 'Recent';
        tooltip = `Fetched ${minutesOld} minutes ago from ReccoBeats API`;
        status = 'recent';
      } else {
        label = 'Cached';
        tooltip = `Fetched ${hoursOld} hour(s) ago from ReccoBeats API`;
        status = 'cached';
      }
    } else if (audioFeatures.source === 'reccobeats_cached') {
      label = 'Cached';
      tooltip = `Cached data from ReccoBeats API (${hoursOld} hour(s) old)`;
      status = 'cached';
    } else if (audioFeatures.source === 'genre_based_fallback') {
      if (audioFeatures.errorCode === 'API_KEY_NOT_CONFIGURED') {
        label = 'Fallback';
        tooltip = 'Genre-based estimate (API key not configured)';
      } else if (audioFeatures.errorCode === 'API_UNAUTHORIZED') {
        label = 'Fallback';
        tooltip = 'Genre-based estimate (API authorization failed)';
      } else if (audioFeatures.errorCode) {
        label = 'Fallback';
        tooltip = `Genre-based estimate (Error: ${audioFeatures.errorCode})`;
      } else {
        label = 'Fallback';
        tooltip = 'Genre-based estimate (API unavailable)';
      }
      status = 'fallback';
    } else {
      label = 'Unknown';
      tooltip = 'Data source unknown';
      status = 'unknown';
    }

    return { label, tooltip, status };
  }

  // Configure API key (for runtime configuration)
  configureApiKey(apiKey) {
    this.apiKey = apiKey;
    this.apiEnabled = apiKey !== null && apiKey !== '';
    this.stats.apiKeyConfigured = this.apiEnabled;
    
    if (this.apiEnabled) {
      console.log('🎵 AudioFeaturesService: API key configured, live data enabled');
    } else {
      console.log('🎵 AudioFeaturesService: API key removed, using fallback only');
    }
  }
}

module.exports = { AudioFeaturesService };

