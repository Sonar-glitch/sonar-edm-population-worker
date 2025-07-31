// /lib/artistProfileService.js
// Core artist profile generation service that orchestrates all audio analysis APIs
// Provides comprehensive artist sound profiling with graceful degradation

const AppleITunesAPI = require('./appleITunesAPI');
const ReccoBeatsAPI = require('./reccoBeatsAPI');
const SoundCloudAPI = require('./soundCloudAPI');
const TemporaryAudioAnalysis = require('./temporaryAudioAnalysis');

class ArtistProfileService {
  constructor() {
    this.appleItunes = new AppleITunesAPI();
    this.reccoBeats = new ReccoBeatsAPI();
    this.soundCloud = new SoundCloudAPI();
    this.temporaryAnalysis = new TemporaryAudioAnalysis();
    
    // Service metrics
    this.metrics = {
      totalRequests: 0,
      successfulProfiles: 0,
      fallbackUsages: 0,
      averageProcessingTime: 0,
      apiUsageStats: {
        appleItunes: { requests: 0, successes: 0 },
        reccoBeats: { requests: 0, successes: 0 },
        soundCloud: { requests: 0, successes: 0 },
        temporaryAnalysis: { requests: 0, successes: 0 }
      }
    };
    
    console.log('🎵 ArtistProfileService initialized with all APIs');
  }

  /**
   * Generate comprehensive artist profile using multi-source analysis
   * @param {string} artistName - Name of the artist
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Complete artist profile
   */
  async generateArtistProfile(artistName, options = {}) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    console.log(`🎤 === GENERATING ARTIST PROFILE: ${artistName} ===`);
    
    try {
      const profile = {
        artistName: artistName,
        soundCharacteristics: {},
        confidence: 0,
        source: 'unknown',
        errorCodes: [],
        processingSteps: [],
        tracksAnalyzed: 0,
        processingTime: 0,
        timestamp: new Date().toISOString()
      };

      // Step 1: Try Apple iTunes + ReccoBeats (Primary path)
      console.log('🍎 Step 1: Attempting Apple iTunes + ReccoBeats analysis...');
      const appleReccoResult = await this.tryAppleItunesReccoBeats(artistName, options);
      
      if (appleReccoResult.success) {
        profile.soundCharacteristics = appleReccoResult.characteristics;
        profile.confidence = appleReccoResult.confidence;
        profile.source = 'apple_reccobeats';
        profile.tracksAnalyzed = appleReccoResult.tracksAnalyzed;
        profile.processingSteps = appleReccoResult.processingSteps;
        
        console.log(`✅ Apple iTunes + ReccoBeats successful (confidence: ${profile.confidence})`);
        this.metrics.successfulProfiles++;
        this.updateApiStats('appleItunes', true);
        this.updateApiStats('reccoBeats', true);
      } else {
        profile.errorCodes.push(...appleReccoResult.errorCodes);
        profile.processingSteps.push(...appleReccoResult.processingSteps);
        
        console.log('⚠️ Apple iTunes + ReccoBeats failed, trying SoundCloud fallback...');
        
        // Step 2: Try SoundCloud + ReccoBeats (Fallback path)
        const soundCloudReccoResult = await this.trySoundCloudReccoBeats(artistName, options);
        
        if (soundCloudReccoResult.success) {
          profile.soundCharacteristics = soundCloudReccoResult.characteristics;
          profile.confidence = soundCloudReccoResult.confidence;
          profile.source = 'soundcloud_reccobeats';
          profile.tracksAnalyzed = soundCloudReccoResult.tracksAnalyzed;
          profile.processingSteps.push(...soundCloudReccoResult.processingSteps);
          
          console.log(`✅ SoundCloud + ReccoBeats successful (confidence: ${profile.confidence})`);
          this.metrics.successfulProfiles++;
          this.updateApiStats('soundCloud', true);
          this.updateApiStats('reccoBeats', true);
        } else {
          profile.errorCodes.push(...soundCloudReccoResult.errorCodes);
          profile.processingSteps.push(...soundCloudReccoResult.processingSteps);
          
          console.log('⚠️ SoundCloud + ReccoBeats failed, using enhanced genre estimation...');
          
          // Step 3: Enhanced genre-based estimation (Final fallback)
          const genreResult = await this.tryEnhancedGenreEstimation(artistName, options);
          
          profile.soundCharacteristics = genreResult.characteristics;
          profile.confidence = genreResult.confidence;
          profile.source = 'enhanced_genre_estimation';
          profile.processingSteps.push(...genreResult.processingSteps);
          
          if (genreResult.confidence > 0.3) {
            this.metrics.successfulProfiles++;
          }
          this.metrics.fallbackUsages++;
          this.updateApiStats('temporaryAnalysis', true);
          
          console.log(`✅ Enhanced genre estimation complete (confidence: ${profile.confidence})`);
        }
      }

      // Calculate processing time and update metrics
      profile.processingTime = Date.now() - startTime;
      this.updateAverageProcessingTime(profile.processingTime);
      
      console.log(`🎉 Artist profile generation complete for ${artistName}:`, {
        source: profile.source,
        confidence: profile.confidence,
        tracksAnalyzed: profile.tracksAnalyzed,
        processingTime: `${profile.processingTime}ms`
      });

      return profile;

    } catch (error) {
      console.error(`❌ Critical error generating profile for ${artistName}:`, error);
      
      // Return emergency fallback profile
      return {
        artistName: artistName,
        soundCharacteristics: this.temporaryAnalysis.getFallbackCharacteristics(),
        confidence: 0.2,
        source: 'emergency_fallback',
        errorCodes: ['CRITICAL_ERROR'],
        processingSteps: [`Critical error: ${error.message}`],
        tracksAnalyzed: 0,
        processingTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Try Apple iTunes + ReccoBeats analysis (Primary path)
   * @param {string} artistName - Artist name
   * @param {Object} options - Options
   * @returns {Promise<Object>} Analysis result
   */
  async tryAppleItunesReccoBeats(artistName, options) {
    const result = {
      success: false,
      characteristics: {},
      confidence: 0,
      tracksAnalyzed: 0,
      processingSteps: [],
      errorCodes: []
    };

    try {
      this.metrics.apiUsageStats.appleItunes.requests++;
      
      // Step 1: Get tracks from Apple iTunes
      const itunesResult = await this.appleItunes.searchArtist(artistName, options.trackLimit || 10);
      result.processingSteps.push(`Apple iTunes search: ${itunesResult.searchSuccess ? 'SUCCESS' : 'FAILED'}`);
      
      if (!itunesResult.searchSuccess || itunesResult.tracks.length === 0) {
        result.errorCodes.push('APPLE_ITUNES_NO_RESULTS');
        this.updateApiStats('appleItunes', false);
        return result;
      }

      console.log(`🍎 Found ${itunesResult.tracks.length} tracks from Apple iTunes`);
      
      // Step 2: Analyze audio with ReccoBeats
      this.metrics.apiUsageStats.reccoBeats.requests++;
      
      const previewUrls = itunesResult.tracks
        .filter(track => track.previewUrl)
        .map(track => track.previewUrl)
        .slice(0, options.trackLimit || 10);

      if (previewUrls.length === 0) {
        result.errorCodes.push('APPLE_ITUNES_NO_PREVIEWS');
        result.processingSteps.push('No preview URLs available from Apple iTunes');
        this.updateApiStats('appleItunes', false);
        return result;
      }

      console.log(`🎵 Analyzing ${previewUrls.length} preview URLs with ReccoBeats`);
      
      const analysisResults = await this.reccoBeats.analyzeMultipleUrls(previewUrls, {
        batchSize: 3,
        features: options.features
      });
      
      result.processingSteps.push(`ReccoBeats analysis: ${analysisResults.filter(r => r.success).length}/${analysisResults.length} successful`);
      
      // Step 3: Aggregate results
      const aggregatedResult = this.reccoBeats.aggregateAnalysisResults(analysisResults);
      
      if (aggregatedResult.success && aggregatedResult.confidence > 0.4) {
        result.success = true;
        result.characteristics = aggregatedResult.characteristics;
        result.confidence = aggregatedResult.confidence;
        result.tracksAnalyzed = aggregatedResult.tracksAnalyzed;
        result.processingSteps.push(`Aggregation successful: confidence ${result.confidence}`);
        
        return result;
      } else {
        result.errorCodes.push('RECCOBEATS_LOW_CONFIDENCE');
        result.processingSteps.push(`ReccoBeats confidence too low: ${aggregatedResult.confidence || 0}`);
        this.updateApiStats('reccoBeats', false);
        return result;
      }

    } catch (error) {
      console.error('❌ Apple iTunes + ReccoBeats analysis failed:', error.message);
      result.errorCodes.push('APPLE_RECCOBEATS_ERROR');
      result.processingSteps.push(`Error: ${error.message}`);
      this.updateApiStats('appleItunes', false);
      this.updateApiStats('reccoBeats', false);
      return result;
    }
  }

  /**
   * Try SoundCloud + ReccoBeats analysis (Fallback path)
   * @param {string} artistName - Artist name
   * @param {Object} options - Options
   * @returns {Promise<Object>} Analysis result
   */
  async trySoundCloudReccoBeats(artistName, options) {
    const result = {
      success: false,
      characteristics: {},
      confidence: 0,
      tracksAnalyzed: 0,
      processingSteps: [],
      errorCodes: []
    };

    try {
      this.metrics.apiUsageStats.soundCloud.requests++;
      
      // Step 1: Get tracks from SoundCloud
      const soundCloudResult = await this.soundCloud.searchArtist(artistName, options.trackLimit || 10);
      result.processingSteps.push(`SoundCloud search: ${soundCloudResult.searchSuccess ? 'SUCCESS' : 'FAILED'}`);
      
      if (!soundCloudResult.searchSuccess) {
        if (soundCloudResult.errorCode) {
          result.errorCodes.push(soundCloudResult.errorCode);
        } else {
          result.errorCodes.push('SOUNDCLOUD_NO_RESULTS');
        }
        this.updateApiStats('soundCloud', false);
        return result;
      }

      if (soundCloudResult.tracks.length === 0) {
        result.errorCodes.push('SOUNDCLOUD_NO_TRACKS');
        this.updateApiStats('soundCloud', false);
        return result;
      }

      console.log(`☁️ Found ${soundCloudResult.tracks.length} tracks from SoundCloud`);
      
      // Step 2: Get stream URLs and analyze with ReccoBeats
      this.metrics.apiUsageStats.reccoBeats.requests++;
      
      const streamUrls = [];
      for (const track of soundCloudResult.tracks.slice(0, options.trackLimit || 10)) {
        try {
          const streamResult = await this.soundCloud.getTrackStreamUrl(track.trackId);
          if (streamResult.success && streamResult.streamUrl) {
            streamUrls.push(streamResult.streamUrl);
          }
        } catch (streamError) {
          console.warn(`⚠️ Failed to get stream URL for track ${track.trackId}`);
        }
      }

      if (streamUrls.length === 0) {
        result.errorCodes.push('SOUNDCLOUD_NO_STREAMS');
        result.processingSteps.push('No stream URLs available from SoundCloud');
        this.updateApiStats('soundCloud', false);
        return result;
      }

      console.log(`🎵 Analyzing ${streamUrls.length} SoundCloud streams with ReccoBeats`);
      
      const analysisResults = await this.reccoBeats.analyzeMultipleUrls(streamUrls, {
        batchSize: 2, // Smaller batches for SoundCloud streams
        features: options.features
      });
      
      result.processingSteps.push(`ReccoBeats analysis: ${analysisResults.filter(r => r.success).length}/${analysisResults.length} successful`);
      
      // Step 3: Aggregate results
      const aggregatedResult = this.reccoBeats.aggregateAnalysisResults(analysisResults);
      
      if (aggregatedResult.success && aggregatedResult.confidence > 0.3) {
        result.success = true;
        result.characteristics = aggregatedResult.characteristics;
        result.confidence = aggregatedResult.confidence * 0.9; // Slight penalty for fallback source
        result.tracksAnalyzed = aggregatedResult.tracksAnalyzed;
        result.processingSteps.push(`SoundCloud aggregation successful: confidence ${result.confidence}`);
        
        return result;
      } else {
        result.errorCodes.push('SOUNDCLOUD_RECCOBEATS_LOW_CONFIDENCE');
        result.processingSteps.push(`SoundCloud + ReccoBeats confidence too low: ${aggregatedResult.confidence || 0}`);
        this.updateApiStats('reccoBeats', false);
        return result;
      }

    } catch (error) {
      console.error('❌ SoundCloud + ReccoBeats analysis failed:', error.message);
      result.errorCodes.push('SOUNDCLOUD_RECCOBEATS_ERROR');
      result.processingSteps.push(`Error: ${error.message}`);
      this.updateApiStats('soundCloud', false);
      this.updateApiStats('reccoBeats', false);
      return result;
    }
  }

  /**
   * Try enhanced genre-based estimation (Final fallback)
   * @param {string} artistName - Artist name
   * @param {Object} options - Options
   * @returns {Promise<Object>} Analysis result
   */
  async tryEnhancedGenreEstimation(artistName, options) {
    const result = {
      characteristics: {},
      confidence: 0,
      processingSteps: [],
      errorCodes: []
    };

    try {
      this.metrics.apiUsageStats.temporaryAnalysis.requests++;
      
      console.log(`🎯 Using enhanced genre estimation for ${artistName}`);
      
      // Try to infer genres from artist name or use provided genres
      let genres = options.genres || [];
      
      if (genres.length === 0) {
        // Basic genre inference from artist name (could be enhanced with a genre database)
        genres = this.inferGenresFromArtistName(artistName);
        result.processingSteps.push(`Inferred genres from artist name: ${genres.join(', ')}`);
      } else {
        result.processingSteps.push(`Using provided genres: ${genres.join(', ')}`);
      }
      
      // Use temporary analysis with genre-based estimation
      const analysisResult = await this.temporaryAnalysis.analyzeArtistGenres(
        artistName, 
        genres, 
        {
          userPreferences: options.userPreferences
        }
      );
      
      if (analysisResult.soundCharacteristics) {
        result.characteristics = analysisResult.soundCharacteristics;
        result.confidence = analysisResult.confidence;
        result.processingSteps.push(`Genre-based analysis complete: ${analysisResult.genreFamily} family`);
        
        // Add penalty information if applied
        if (analysisResult.soundCharacteristics._penalty) {
          result.processingSteps.push(`Applied penalty: ${analysisResult.soundCharacteristics._penalty.type}`);
        }
        
        this.updateApiStats('temporaryAnalysis', true);
      } else {
        result.errorCodes.push('GENRE_ESTIMATION_FAILED');
        result.processingSteps.push('Genre-based estimation failed');
        this.updateApiStats('temporaryAnalysis', false);
      }
      
      return result;

    } catch (error) {
      console.error('❌ Enhanced genre estimation failed:', error.message);
      result.errorCodes.push('GENRE_ESTIMATION_ERROR');
      result.processingSteps.push(`Error: ${error.message}`);
      this.updateApiStats('temporaryAnalysis', false);
      
      // Return absolute fallback
      result.characteristics = this.temporaryAnalysis.getFallbackCharacteristics();
      result.confidence = 0.2;
      result.processingSteps.push('Using absolute fallback characteristics');
      
      return result;
    }
  }

  /**
   * Infer genres from artist name using basic heuristics
   * @param {string} artistName - Artist name
   * @returns {Array} Inferred genres
   */
  inferGenresFromArtistName(artistName) {
    const name = artistName.toLowerCase();
    const genres = [];
    
    // Electronic music indicators
    const electronicIndicators = [
      'dj', 'mc', 'electronic', 'digital', 'cyber', 'synth', 'techno', 'house',
      'beats', 'bass', 'drop', 'mix', 'remix', 'club', 'rave', 'edm'
    ];
    
    // Rock music indicators
    const rockIndicators = [
      'band', 'rock', 'metal', 'punk', 'grunge', 'alternative', 'indie'
    ];
    
    // Folk/acoustic indicators
    const folkIndicators = [
      'folk', 'acoustic', 'country', 'bluegrass', 'americana', 'singer'
    ];
    
    // Check for electronic indicators
    if (electronicIndicators.some(indicator => name.includes(indicator))) {
      genres.push('electronic', 'dance');
    }
    
    // Check for rock indicators
    if (rockIndicators.some(indicator => name.includes(indicator))) {
      genres.push('rock', 'alternative rock');
    }
    
    // Check for folk indicators
    if (folkIndicators.some(indicator => name.includes(indicator))) {
      genres.push('folk', 'acoustic');
    }
    
    // Default to electronic if no clear indicators (EDM-focused app)
    if (genres.length === 0) {
      genres.push('electronic', 'dance');
    }
    
    return genres;
  }

  /**
   * Get comprehensive health status of all services
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    console.log('🏥 Checking health status of all services...');
    
    try {
      const [appleStatus, reccoStatus, soundCloudStatus, tempStatus] = await Promise.allSettled([
        this.appleItunes.getStatus(),
        this.reccoBeats.getStatus(),
        this.soundCloud.getStatus(),
        this.temporaryAnalysis.getStatus()
      ]);

      const services = {
        appleItunes: appleStatus.status === 'fulfilled' ? appleStatus.value : { status: 'error', error: appleStatus.reason?.message },
        reccoBeats: reccoStatus.status === 'fulfilled' ? reccoStatus.value : { status: 'error', error: reccoStatus.reason?.message },
        soundCloud: soundCloudStatus.status === 'fulfilled' ? soundCloudStatus.value : { status: 'error', error: soundCloudStatus.reason?.message },
        temporaryAnalysis: tempStatus.status === 'fulfilled' ? tempStatus.value : { status: 'error', error: tempStatus.reason?.message }
      };

      // Determine overall health
      const operationalServices = Object.values(services).filter(s => s.status === 'operational').length;
      const totalServices = Object.keys(services).length;
      
      let overall;
      if (operationalServices === totalServices) {
        overall = 'healthy';
      } else if (operationalServices >= totalServices / 2) {
        overall = 'degraded';
      } else if (services.temporaryAnalysis.status === 'operational') {
        overall = 'critical'; // Can still function with genre estimation
      } else {
        overall = 'error';
      }

      return {
        overall: overall,
        services: services,
        operationalServices: operationalServices,
        totalServices: totalServices,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Health status check failed:', error.message);
      
      return {
        overall: 'error',
        services: {},
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Update API usage statistics
   * @param {string} apiName - Name of the API
   * @param {boolean} success - Whether the request was successful
   */
  updateApiStats(apiName, success) {
    if (this.metrics.apiUsageStats[apiName]) {
      if (success) {
        this.metrics.apiUsageStats[apiName].successes++;
      }
    }
  }

  /**
   * Update average processing time
   * @param {number} processingTime - Processing time in milliseconds
   */
  updateAverageProcessingTime(processingTime) {
    const currentAvg = this.metrics.averageProcessingTime;
    const totalRequests = this.metrics.totalRequests;
    
    this.metrics.averageProcessingTime = ((currentAvg * (totalRequests - 1)) + processingTime) / totalRequests;
  }

  /**
   * Get service metrics for monitoring
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalRequests > 0 ? 
        (this.metrics.successfulProfiles / this.metrics.totalRequests) : 0,
      fallbackRate: this.metrics.totalRequests > 0 ? 
        (this.metrics.fallbackUsages / this.metrics.totalRequests) : 0,
      apiSuccessRates: Object.fromEntries(
        Object.entries(this.metrics.apiUsageStats).map(([api, stats]) => [
          api, 
          stats.requests > 0 ? (stats.successes / stats.requests) : 0
        ])
      )
    };
  }

  /**
   * Reset metrics (for testing or periodic reset)
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulProfiles: 0,
      fallbackUsages: 0,
      averageProcessingTime: 0,
      apiUsageStats: {
        appleItunes: { requests: 0, successes: 0 },
        reccoBeats: { requests: 0, successes: 0 },
        soundCloud: { requests: 0, successes: 0 },
        temporaryAnalysis: { requests: 0, successes: 0 }
      }
    };
  }
}

module.exports = ArtistProfileService;

