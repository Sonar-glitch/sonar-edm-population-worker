// /lib/reccoBeatsAPI.js
// ReccoBeats API integration for audio analysis
// No API key required based on user feedback

class ReccoBeatsAPI {
  constructor() {
    this.baseURL = 'https://api.reccobeats.com';
    this.timeout = 15000; // 15 seconds for audio analysis
    this.maxRetries = 2; // Fewer retries for audio analysis
    this.rateLimitDelay = 1000; // 1 second between requests
    this.lastRequestTime = 0;
  }

  /**
   * Analyze audio characteristics from a preview URL
   * @param {string} audioUrl - URL to audio preview (30 seconds)
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Audio analysis results
   */
  async analyzeAudioUrl(audioUrl, options = {}) {
    console.log(`🎵 ReccoBeats: Analyzing audio URL: ${audioUrl.substring(0, 50)}...`);
    
    try {
      // Rate limiting
      await this.enforceRateLimit();
      
      const analysisRequest = {
        url: audioUrl,
        features: options.features || [
          'energy',
          'danceability', 
          'valence',
          'tempo',
          'acousticness',
          'instrumentalness',
          'speechiness',
          'loudness',
          'key',
          'mode'
        ],
        format: 'detailed'
      };

      const response = await this.makeRequest('/analyze/url', 'POST', analysisRequest);
      
      if (!response.success) {
        throw new Error(response.error || 'Analysis failed');
      }

      const processedResults = this.processAnalysisResults(response.data, audioUrl);
      
      console.log(`✅ ReccoBeats analysis complete:`, {
        energy: processedResults.characteristics.energy,
        danceability: processedResults.characteristics.danceability,
        confidence: processedResults.confidence
      });

      return processedResults;

    } catch (error) {
      console.error(`❌ ReccoBeats analysis failed for ${audioUrl}:`, error.message);
      
      return {
        success: false,
        audioUrl: audioUrl,
        characteristics: null,
        confidence: 0,
        error: error.message,
        source: 'reccobeats_error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Analyze multiple audio URLs in batch
   * @param {Array} audioUrls - Array of audio URLs
   * @param {Object} options - Analysis options
   * @returns {Promise<Array>} Array of analysis results
   */
  async analyzeMultipleUrls(audioUrls, options = {}) {
    console.log(`🎵 ReccoBeats: Batch analyzing ${audioUrls.length} audio URLs`);
    
    const results = [];
    const batchSize = options.batchSize || 3; // Process 3 at a time to avoid overwhelming
    
    for (let i = 0; i < audioUrls.length; i += batchSize) {
      const batch = audioUrls.slice(i, i + batchSize);
      
      console.log(`🎵 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(audioUrls.length/batchSize)}`);
      
      const batchPromises = batch.map(url => this.analyzeAudioUrl(url, options));
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.warn('🎵 Batch analysis failed:', result.reason?.message);
          results.push({
            success: false,
            error: result.reason?.message || 'Batch analysis failed',
            source: 'reccobeats_batch_error'
          });
        }
      }
      
      // Delay between batches to respect rate limits
      if (i + batchSize < audioUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`✅ ReccoBeats batch analysis complete: ${results.filter(r => r.success).length}/${results.length} successful`);
    
    return results;
  }

  /**
   * Get aggregated characteristics from multiple track analyses
   * @param {Array} analysisResults - Array of analysis results
   * @returns {Object} Aggregated characteristics
   */
  aggregateAnalysisResults(analysisResults) {
    const successfulResults = analysisResults.filter(result => result.success && result.characteristics);
    
    if (successfulResults.length === 0) {
      return {
        success: false,
        characteristics: null,
        confidence: 0,
        tracksAnalyzed: 0,
        error: 'No successful analyses to aggregate'
      };
    }
    
    console.log(`🎵 Aggregating ${successfulResults.length} successful analyses`);
    
    const characteristics = {
      energy: 0,
      danceability: 0,
      valence: 0,
      tempo: 0,
      acousticness: 0,
      instrumentalness: 0,
      speechiness: 0,
      loudness: 0
    };
    
    let totalWeight = 0;
    
    // Weighted average based on confidence scores
    for (const result of successfulResults) {
      const weight = result.confidence || 0.5;
      totalWeight += weight;
      
      for (const [key, value] of Object.entries(result.characteristics)) {
        if (characteristics.hasOwnProperty(key) && typeof value === 'number') {
          characteristics[key] += value * weight;
        }
      }
    }
    
    // Normalize by total weight
    for (const key of Object.keys(characteristics)) {
      characteristics[key] = Math.round(characteristics[key] / totalWeight);
    }
    
    // Calculate overall confidence
    const avgConfidence = successfulResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / successfulResults.length;
    const coverageBonus = Math.min(successfulResults.length / 10, 0.2); // Bonus for more tracks
    const overallConfidence = Math.min(avgConfidence + coverageBonus, 1.0);
    
    return {
      success: true,
      characteristics: characteristics,
      confidence: overallConfidence,
      tracksAnalyzed: successfulResults.length,
      source: 'reccobeats_aggregated',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Process raw analysis results from ReccoBeats API
   * @param {Object} rawData - Raw API response data
   * @param {string} audioUrl - Original audio URL
   * @returns {Object} Processed analysis results
   */
  processAnalysisResults(rawData, audioUrl) {
    try {
      // Map ReccoBeats response to our standard format
      const characteristics = {
        energy: this.normalizeValue(rawData.energy, 0, 1, 0, 100),
        danceability: this.normalizeValue(rawData.danceability, 0, 1, 0, 100),
        valence: this.normalizeValue(rawData.valence, 0, 1, 0, 100),
        tempo: Math.round(rawData.tempo || 120),
        acousticness: this.normalizeValue(rawData.acousticness, 0, 1, 0, 100),
        instrumentalness: this.normalizeValue(rawData.instrumentalness, 0, 1, 0, 100),
        speechiness: this.normalizeValue(rawData.speechiness, 0, 1, 0, 100),
        loudness: rawData.loudness || -10
      };
      
      // Calculate confidence based on data completeness and quality
      let confidence = 0.8; // Base confidence for ReccoBeats
      
      // Reduce confidence for missing or invalid values
      const requiredFields = ['energy', 'danceability', 'valence', 'tempo'];
      for (const field of requiredFields) {
        if (!rawData[field] || isNaN(rawData[field])) {
          confidence -= 0.1;
        }
      }
      
      // Bonus for additional features
      if (rawData.key !== undefined) confidence += 0.05;
      if (rawData.mode !== undefined) confidence += 0.05;
      if (rawData.time_signature) confidence += 0.05;
      
      return {
        success: true,
        audioUrl: audioUrl,
        characteristics: characteristics,
        confidence: Math.max(0.3, Math.min(confidence, 1.0)),
        rawData: rawData,
        source: 'reccobeats',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Error processing ReccoBeats results:', error.message);
      
      return {
        success: false,
        audioUrl: audioUrl,
        characteristics: null,
        confidence: 0,
        error: `Processing failed: ${error.message}`,
        source: 'reccobeats_processing_error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Check ReccoBeats API status
   * @returns {Promise<Object>} Service status
   */
  async getStatus() {
    console.log('🎵 Checking ReccoBeats API status...');
    
    try {
      const response = await this.makeRequest('/status', 'GET');
      
      const status = {
        service: 'reccobeats',
        status: response.status === 'operational' ? 'operational' : 'degraded',
        available: response.status === 'operational',
        lastChecked: new Date().toISOString(),
        apiVersion: response.version || 'unknown',
        features: response.features || [],
        rateLimit: response.rateLimit || 'unknown'
      };
      
      console.log(`🎵 ReccoBeats API status: ${status.status}`);
      return status;
      
    } catch (error) {
      console.error('❌ ReccoBeats status check failed:', error.message);
      
      // Try a simple ping to see if service is reachable
      try {
        await this.makeRequest('/ping', 'GET');
        return {
          service: 'reccobeats',
          status: 'degraded',
          available: true,
          lastChecked: new Date().toISOString(),
          error: 'Status endpoint failed but service reachable'
        };
      } catch (pingError) {
        return {
          service: 'reccobeats',
          status: 'error',
          available: false,
          lastChecked: new Date().toISOString(),
          error: error.message
        };
      }
    }
  }

  /**
   * Make HTTP request to ReccoBeats API
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP method
   * @param {Object} data - Request data
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(endpoint, method = 'GET', data = null) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🎵 ReccoBeats API ${method} ${endpoint} (attempt ${attempt}/${this.maxRetries})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        const requestOptions = {
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TIKO-Audio-Analysis/1.0',
            'Accept': 'application/json'
          },
          signal: controller.signal
        };
        
        // No API key required based on user feedback
        // requestOptions.headers['Authorization'] = `Bearer ${this.apiKey}`;
        
        if (data && (method === 'POST' || method === 'PUT')) {
          requestOptions.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${this.baseURL}${endpoint}`, requestOptions);
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const responseData = await response.json();
        console.log(`✅ ReccoBeats API request successful (attempt ${attempt})`);
        
        return responseData;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ ReccoBeats API attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.maxRetries) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000); // Exponential backoff
          console.log(`⏳ Retrying ReccoBeats API in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`ReccoBeats API failed after ${this.maxRetries} attempts: ${lastError.message}`);
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
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Normalize value from one range to another
   * @param {number} value - Input value
   * @param {number} inMin - Input minimum
   * @param {number} inMax - Input maximum  
   * @param {number} outMin - Output minimum
   * @param {number} outMax - Output maximum
   * @returns {number} Normalized value
   */
  normalizeValue(value, inMin, inMax, outMin, outMax) {
    if (value === null || value === undefined || isNaN(value)) {
      return Math.round((outMin + outMax) / 2); // Return middle value for invalid input
    }
    
    const normalized = ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
    return Math.round(Math.max(outMin, Math.min(outMax, normalized)));
  }

  /**
   * Get metrics for monitoring
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      service: 'reccobeats',
      baseURL: this.baseURL,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      rateLimitDelay: this.rateLimitDelay,
      authRequired: false, // No API key required
      features: [
        'Audio URL analysis',
        'Batch processing',
        'Result aggregation',
        'Confidence scoring',
        'Rate limiting',
        'Multiple audio features'
      ],
      supportedFeatures: [
        'energy',
        'danceability',
        'valence', 
        'tempo',
        'acousticness',
        'instrumentalness',
        'speechiness',
        'loudness',
        'key',
        'mode'
      ]
    };
  }
}

module.exports = ReccoBeatsAPI;

