// ENHANCED: lib/recommendationEnhancer.js (MUSIC TASTE ALGORITHM ENHANCEMENT + SOUND CHARACTERISTICS)
// Enhanced recommendation enhancement for events pipeline with 6-factor scoring
// Memory-optimized for Basic dyno (512MB)
// SURGICAL ENHANCEMENT: Preserves ALL existing 5-factor scoring + adds sound characteristics as 6th factor

const { AudioFeaturesService } = require('./audioFeaturesService');

class RecommendationEnhancer {
  constructor() {
    // PRESERVED: All existing configuration
    this.enabled = process.env.RECOMMENDATION_ENHANCEMENT_ENABLED === 'true';
    
    // NEW: Sound characteristics configuration
    this.soundCharacteristicsEnabled = process.env.SOUND_CHARACTERISTICS_ENABLED === 'true';
    this.audioFeaturesService = new AudioFeaturesService();

    // PRESERVED: All existing EDM genre weights (exact copy)
    this.edmGenreWeights = new Map([
      // Core EDM genres (highest weight)
      ['house', 1.0], ['techno', 1.0], ['trance', 1.0], ['dubstep', 1.0],
      ['progressive house', 1.0], ['deep house', 1.0], ['tech house', 1.0],
      ['electro house', 1.0], ['big room', 1.0], ['future house', 1.0],
      ['drum and bass', 1.0], ['dnb', 1.0], ['hardstyle', 1.0], ['trap', 1.0],

      // Electronic-related genres (medium weight)
      ['electronic', 0.8], ['dance', 0.8], ['edm', 0.8],
      ['electro', 0.7], ['electronica', 0.7], ['ambient', 0.5],

      // Non-EDM genres (low/zero weight)
      ['hip hop', 0.1], ['jazz', 0.0], ['rock', 0.0], ['pop', 0.2],
      ['country', 0.0], ['folk', 0.0], ['classical', 0.0]
    ]);

    // PRESERVED: All existing artist genres (exact copy)
    this.artistGenres = new Map([
      // EDM Artists
      ['deadmau5', { genre: 'progressive house', weight: 1.0 }],
      ['calvin harris', { genre: 'electro house', weight: 1.0 }],
      ['tiësto', { genre: 'trance', weight: 1.0 }],
      ['david guetta', { genre: 'electro house', weight: 1.0 }],
      ['martin garrix', { genre: 'big room', weight: 1.0 }],
      ['hardwell', { genre: 'big room', weight: 1.0 }],
      ['armin van buuren', { genre: 'trance', weight: 1.0 }],
      ['above & beyond', { genre: 'trance', weight: 1.0 }],
      ['skrillex', { genre: 'dubstep', weight: 1.0 }],
      ['porter robinson', { genre: 'electronic', weight: 0.9 }],
      ['madeon', { genre: 'electronic', weight: 0.9 }],
      ['flume', { genre: 'electronic', weight: 0.9 }],
      ['bonobo', { genre: 'electronic', weight: 0.7 }],
      ['kiasmos', { genre: 'electronic', weight: 0.7 }],
      ['tycho', { genre: 'ambient', weight: 0.6 }],

      // NON-EDM Artists (PRESERVED: Proper genre classification)
      ['kid koala', { genre: 'hip hop', weight: 0.1 }],
      ['chris botti', { genre: 'jazz', weight: 0.0 }],
      ['drake', { genre: 'hip hop', weight: 0.0 }],
      ['coldplay', { genre: 'rock', weight: 0.0 }],
      ['miles davis', { genre: 'jazz', weight: 0.0 }],
      ['john coltrane', { genre: 'jazz', weight: 0.0 }],
      ['the beatles', { genre: 'rock', weight: 0.0 }],
      ['taylor swift', { genre: 'pop', weight: 0.2 }]
    ]);

    // PRESERVED: All existing artist popularity data (exact copy)
    this.artistPopularity = new Map([
      // High popularity EDM artists
      ['calvin harris', 95],
      ['david guetta', 92],
      ['martin garrix', 90],
      ['tiësto', 88],
      ['skrillex', 85],
      ['deadmau5', 82],
      ['hardwell', 80],
      ['armin van buuren', 85],
      ['above & beyond', 78],
      ['porter robinson', 75],
      ['madeon', 72],
      ['flume', 80],
      ['bonobo', 70],
      ['kiasmos', 65],
      ['tycho', 68],
      
      // Non-EDM artists
      ['drake', 98],
      ['taylor swift', 96],
      ['coldplay', 85],
      ['kid koala', 45],
      ['chris botti', 55],
      ['miles davis', 70],
      ['john coltrane', 68],
      ['the beatles', 90]
    ]);

    // PRESERVED: All existing city trending bonuses (exact copy)
    this.cityTrendingBonus = new Map([
      // Major EDM cities get higher bonuses for EDM events
      ['toronto', 1.2],
      ['montreal', 1.15],
      ['vancouver', 1.1],
      ['berlin', 1.3],
      ['amsterdam', 1.25],
      ['london', 1.2],
      ['new york', 1.15],
      ['los angeles', 1.15],
      ['miami', 1.25],
      ['ibiza', 1.4],
      ['las vegas', 1.2]
    ]);

    // UPDATED: Version tracking
    this.version = '2.1.0'; // Enhanced with sound characteristics
    
    console.log(`🎵 RecommendationEnhancer v${this.version} initialized`);
    console.log(`   Enhancement enabled: ${this.enabled}`);
    console.log(`   Sound characteristics: ${this.soundCharacteristicsEnabled}`);
  }

  // PRESERVED: Only enhance events that need enhancement (exact copy)
  needsEnhancement(event) {
    const alreadyProcessed = event.enhancementProcessed === true;
    const hasOurScore = event.recommendationMetrics?.tasteScore !== undefined;
    return !alreadyProcessed && !hasOurScore;
  }

  // ENHANCED: Minimal enhancement processing with sound characteristics
  async enhanceEvent(event) {
    if (!this.enabled || !this.needsEnhancement(event)) {
      return { ...event, enhancementProcessed: false, enhancementSkipped: true };
    }

    try {
      // PRESERVED: Stage 1: Artist extraction
      const artistEnhanced = this.extractArtists(event);

      // PRESERVED: Stage 2: Genre detection (Artist-first approach)
      const genreEnhanced = this.detectGenres(artistEnhanced);

      // NEW: Stage 3: Sound characteristics extraction (optional)
      let soundEnhanced = genreEnhanced;
      if (this.soundCharacteristicsEnabled) {
        try {
          soundEnhanced = await this.extractSoundCharacteristics(genreEnhanced);
        } catch (error) {
          console.warn(`Sound characteristics extraction failed for ${event.name}:`, error.message);
          soundEnhanced = {
            ...genreEnhanced,
            soundCharacteristics: {
              source: 'extraction_failed',
              error: error.message,
              dataFreshness: new Date()
            }
          };
        }
      }

      // ENHANCED: Stage 4: 6-factor recommendation scoring (was 5-factor)
      const scoreEnhanced = this.calculateEnhancedRecommendationScore(soundEnhanced);

      return {
        ...scoreEnhanced,
        enhancementProcessed: true,
        enhancementMetadata: {
          processedAt: new Date(),
          version: this.version,
          stages: this.soundCharacteristicsEnabled 
            ? ['artist_extraction', 'genre_detection', 'sound_characteristics', 'enhanced_recommendation_scoring']
            : ['artist_extraction', 'genre_detection', 'enhanced_recommendation_scoring']
        }
      };
    } catch (error) {
      console.warn(`Enhancement failed for ${event.name}:`, error.message);
      return { ...event, enhancementProcessed: false, enhancementError: error.message };
    }
  }

  // PRESERVED: Extract artists from event data (exact copy)
  extractArtists(event) {
    let artists = [];

    // PRESERVED: Use artistList first (array of strings)
    if (event.artistList && Array.isArray(event.artistList)) {
      artists = [...event.artistList];
    }
    // PRESERVED: Extract from artists array (array of objects)
    else if (event.artists && Array.isArray(event.artists)) {
      artists = event.artists.map(a => a.name || a).filter(Boolean);
    }
    // Extract from event name (last resort)
    else if (event.name) {
      artists = this.parseArtistsFromName(event.name);
    }

    // Remove duplicates and validate
    artists = [...new Set(artists)].filter(artist =>
      typeof artist === 'string' && artist.length > 1 && artist.length < 50
    );

    return {
      ...event,
      artists,
      artistExtraction: {
        method: artists.length > 0 ? 'enhanced' : 'none',
        confidence: artists.length > 0 ? 80 : 0,
        extractedAt: new Date()
      }
    };
  }

  // PRESERVED: Parse artists from event names (exact copy)
  parseArtistsFromName(eventName) {
    // Simple artist extraction from event names
    const name = eventName.toLowerCase();

    // Remove common noise words
    const cleanName = name
      .replace(/\b(presents|live|tour|concert|show|night|party|festival)\b/g, '')
      .replace(/\b(at|in|with|featuring|ft\.?|vs\.?|&)\b/g, ',')
      .replace(/[^\w\s,]/g, ' ')
      .trim();

    // Split and clean
    const artists = cleanName
      .split(/[,\-]/)
      .map(artist => artist.trim())
      .filter(artist => artist.length > 2 && artist.length < 30)
      .slice(0, 3); // Max 3 artists from name

    return artists;
  }

  // PRESERVED: Detect genres using ARTIST-FIRST approach (exact copy)
  detectGenres(event) {
    let genres = [];
    let primaryGenre = 'unknown';
    let isEdmEvent = false;
    let edmConfidence = 0;
    let detectionMethod = 'none';

    // PRIORITY 1: Artist-based genre detection (MOST RELIABLE)
    if (event.artists && event.artists.length > 0) {
      for (const artist of event.artists) {
        const normalizedArtist = artist.toLowerCase().trim();
        if (this.artistGenres.has(normalizedArtist)) {
          const artistInfo = this.artistGenres.get(normalizedArtist);
          genres.push(artistInfo.genre);
          detectionMethod = 'artist_based';

          // If we found a known artist, use their genre as primary
          if (primaryGenre === 'unknown') {
            primaryGenre = artistInfo.genre;
          }
          break; // Use first known artist's genre
        }
      }
    }

    // PRIORITY 2: Ticketmaster classification (ONLY if no artist match)
    if (genres.length === 0 && event.genre) {
      const mappedGenre = this.mapTicketmasterGenre(event.genre);
      if (mappedGenre) {
        genres.push(mappedGenre);
        primaryGenre = mappedGenre;
        detectionMethod = 'ticketmaster';
      }
    }

    // PRIORITY 3: Fallback to unknown
    if (genres.length === 0) {
      genres = ['unknown'];
      primaryGenre = 'unknown';
      detectionMethod = 'fallback';
    }

    // Calculate EDM status based on PRIMARY genre (not all genres)
    const primaryWeight = this.edmGenreWeights.get(primaryGenre.toLowerCase()) || 0;
    isEdmEvent = primaryWeight >= 0.5;
    edmConfidence = Math.round(primaryWeight * 100);

    // PRESERVED: Strong non-EDM genres override everything
    const strongNonEdmGenres = ['hip hop', 'jazz', 'rock', 'pop', 'country', 'folk', 'classical'];
    if (strongNonEdmGenres.includes(primaryGenre.toLowerCase())) {
      isEdmEvent = false;
      edmConfidence = 0;
    }

    return {
      ...event,
      genres: [...new Set(genres)],
      primaryGenre,
      isEdmEvent,
      edmConfidence,
      genreDetection: {
        method: detectionMethod,
        confidence: detectionMethod === 'artist_based' ? 90 : (detectionMethod === 'ticketmaster' ? 60 : 30),
        detectedAt: new Date()
      }
    };
  }

  // PRESERVED: Map Ticketmaster genres (exact copy)
  mapTicketmasterGenre(ticketmasterGenre) {
    const genre = ticketmasterGenre.toLowerCase().trim();
    const mappings = {
      'dance/electronic': 'electronic',
      'electronic/dance': 'electronic',
      'edm': 'electronic',
      'hip-hop': 'hip hop',
      'hip hop/rap': 'hip hop',
      'rap': 'hip hop'
    };
    return mappings[genre] || genre;
  }

  // NEW: Extract sound characteristics using API + fallback
  async extractSoundCharacteristics(event) {
    try {
      const audioFeatures = await this.audioFeaturesService.getEventAudioFeatures({
        ...event,
        primaryGenre: event.primaryGenre
      });

      const freshnessInfo = this.audioFeaturesService.getDataFreshnessIndicator(audioFeatures);

      return {
        ...event,
        soundCharacteristics: {
          energy: audioFeatures.energy,
          danceability: audioFeatures.danceability,
          valence: audioFeatures.valence,
          tempo: audioFeatures.tempo,
          acousticness: audioFeatures.acousticness || 0.1,
          instrumentalness: audioFeatures.instrumentalness || 0.5,
          speechiness: audioFeatures.speechiness || 0.1,
          confidence: audioFeatures.confidence,
          source: audioFeatures.source,
          dataFreshness: audioFeatures.dataFreshness,
          errorCode: audioFeatures.errorCode,
          errorMessage: audioFeatures.errorMessage,
          
          // UI display information
          freshnessLabel: freshnessInfo.label,
          freshnessTooltip: freshnessInfo.tooltip,
          freshnessStatus: freshnessInfo.status
        }
      };

    } catch (error) {
      throw new Error(`Sound characteristics extraction failed: ${error.message}`);
    }
  }

  // ENHANCED: 6-factor recommendation score calculation (was 5-factor)
  calculateEnhancedRecommendationScore(event) {
    let tasteScore = 0;
    const scoreBreakdown = {};

    // Determine if we have sound characteristics
    const hasSoundCharacteristics = event.soundCharacteristics && 
                                   event.soundCharacteristics.source !== 'extraction_failed';

    // ADAPTIVE WEIGHTS based on sound characteristics availability
    let weights;
    if (hasSoundCharacteristics) {
      // 6-FACTOR ENHANCED SCORING with sound characteristics
      weights = {
        genre: 0.30,     // Reduced from 35% to make room for sound
        artist: 0.25,    // Reduced from 30% to make room for sound
        sound: 0.20,     // NEW: Sound characteristics factor
        recency: 0.12,   // Reduced from 15% to balance
        popularity: 0.08, // Reduced from 10% to balance
        geo: -0.05       // Reduced from -10% to balance
      };
    } else {
      // PRESERVED: Original 5-factor weights when sound unavailable
      weights = {
        genre: 0.35,     // Original weight preserved
        artist: 0.30,    // Original weight preserved
        recency: 0.15,   // Original weight preserved
        popularity: 0.10, // Original weight preserved
        geo: -0.10       // Original weight preserved
      };
    }

    // PRESERVED: 1. Genre-based scoring
    const genreScore = this.calculateGenreScore(event);
    tasteScore += genreScore.score * weights.genre;
    scoreBreakdown.genre = { ...genreScore, weight: Math.round(weights.genre * 100) };

    // PRESERVED: 2. Artist-based scoring
    const artistScore = this.calculateArtistScore(event);
    tasteScore += artistScore.score * weights.artist;
    scoreBreakdown.artist = { ...artistScore, weight: Math.round(weights.artist * 100) };

    // PRESERVED: 3. Recency boost
    const recencyBoost = this.calculateRecencyBoost(event);
    tasteScore += recencyBoost.score * weights.recency;
    scoreBreakdown.recency = { ...recencyBoost, weight: Math.round(weights.recency * 100) };

    // PRESERVED: 4. Popularity boost
    const popularityBoost = this.calculatePopularityBoost(event);
    tasteScore += popularityBoost.score * weights.popularity;
    scoreBreakdown.popularity = { ...popularityBoost, weight: Math.round(weights.popularity * 100) };

    // PRESERVED: 5. Geo penalty
    const geoPenalty = this.calculateGeoPenalty(event);
    tasteScore += geoPenalty.score * weights.geo;
    scoreBreakdown.geo = { ...geoPenalty, weight: Math.round(weights.geo * 100) };

    // NEW: 6. Sound characteristics scoring (only if available)
    if (hasSoundCharacteristics) {
      const soundScore = this.calculateSoundScore(event.soundCharacteristics);
      tasteScore += soundScore.score * weights.sound;
      scoreBreakdown.sound = { 
        ...soundScore, 
        weight: Math.round(weights.sound * 100),
        confidence: event.soundCharacteristics.confidence,
        source: event.soundCharacteristics.source
      };
    }

    // Normalize to 0-100 scale with improved bounds
    const finalScore = Math.max(20, Math.min(100, Math.round(tasteScore)));

    return {
      ...event,
      recommendationMetrics: {
        tasteScore: finalScore,
        scoreBreakdown,
        confidence: this.calculateConfidence(event, scoreBreakdown),
        calculatedAt: new Date(),
        version: this.version,
        algorithm: hasSoundCharacteristics ? '6_factor_enhanced_with_sound' : '5_factor_enhanced_preserved',
        soundCharacteristicsUsed: hasSoundCharacteristics
      }
    };
  }

  // NEW: Calculate sound characteristics score
  calculateSoundScore(soundCharacteristics) {
    if (!soundCharacteristics) {
      return { score: 50, details: 'No sound characteristics available' };
    }

    // Default EDM-focused profile for scoring
    const edmProfile = {
      energy: 0.75,        // Moderate to high energy preference
      danceability: 0.80,  // High danceability preference (EDM focus)
      valence: 0.60,       // Moderate positivity preference
      tempo: 125           // Preferred BPM around 125
    };

    let totalSimilarity = 0;
    let weightSum = 0;

    const featureWeights = {
      energy: 0.30,        // High importance for EDM
      danceability: 0.30,  // High importance for EDM
      valence: 0.20,       // Medium importance for mood
      tempo: 0.20          // Medium importance for BPM preference
    };

    Object.entries(featureWeights).forEach(([feature, weight]) => {
      if (soundCharacteristics[feature] !== undefined && edmProfile[feature] !== undefined) {
        let similarity;
        
        if (feature === 'tempo') {
          const difference = Math.abs(soundCharacteristics[feature] - edmProfile[feature]);
          const maxReasonableDifference = 50; // 50 BPM max difference
          similarity = Math.max(0, 1 - (difference / maxReasonableDifference));
        } else {
          const difference = Math.abs(soundCharacteristics[feature] - edmProfile[feature]);
          similarity = 1 - difference;
        }
        
        totalSimilarity += similarity * weight;
        weightSum += weight;
      }
    });

    if (weightSum === 0) {
      return { score: 50, details: 'No valid sound features for comparison' };
    }

    const similarityScore = (totalSimilarity / weightSum) * 100;
    const confidence = soundCharacteristics.confidence || 0.5;
    const confidenceWeightedScore = (similarityScore * confidence) + (50 * (1 - confidence));
    
    const finalScore = Math.round(Math.max(0, Math.min(100, confidenceWeightedScore)));

    return {
      score: finalScore,
      details: `Sound similarity: ${Math.round(similarityScore)}% (confidence: ${Math.round(confidence * 100)}%)`
    };
  }

  // PRESERVED: Calculate genre score (exact copy)
  calculateGenreScore(event) {
    if (!event.primaryGenre || event.primaryGenre === 'unknown') {
      return { score: 10, details: 'No primary genre' };
    }

    const primaryWeight = this.edmGenreWeights.get(event.primaryGenre.toLowerCase()) || 0;

    // PRESERVED: Heavily penalize non-EDM primary genres
    const strongNonEdmGenres = ['hip hop', 'jazz', 'rock', 'pop', 'country', 'folk', 'classical'];
    if (strongNonEdmGenres.includes(event.primaryGenre.toLowerCase())) {
      return {
        score: Math.min(15, primaryWeight * 100), // Even lower cap for non-EDM
        details: `Non-EDM primary genre: ${event.primaryGenre} (capped at 15%)`
      };
    }

    return {
      score: primaryWeight * 100,
      details: `Primary genre: ${event.primaryGenre} (${primaryWeight * 100}%)`
    };
  }

  // PRESERVED: Calculate artist score (exact copy)
  calculateArtistScore(event) {
    if (!event.artists || event.artists.length === 0) {
      return { score: 5, details: 'No artists detected' };
    }

    let maxScore = 0;
    let bestArtist = '';

    event.artists.forEach(artist => {
      const normalizedArtist = artist.toLowerCase().trim();
      const artistInfo = this.artistGenres.get(normalizedArtist);

      if (artistInfo) {
        const score = artistInfo.weight * 100;
        if (score > maxScore) {
          maxScore = score;
          bestArtist = artist;
        }
      }
    });

    if (maxScore === 0) {
      return { score: 15, details: 'Unknown artists but artist data available' };
    }

    return {
      score: maxScore,
      details: `Best artist: ${bestArtist} (${maxScore}%)`
    };
  }

  // PRESERVED: Calculate tiered recency boost (exact copy)
  calculateRecencyBoost(event) {
    if (!event.date) {
      return { score: 10, details: 'No event date available' };
    }

    const eventDate = new Date(event.date);
    const currentDate = new Date();
    const daysUntil = Math.ceil((eventDate - currentDate) / (1000 * 60 * 60 * 24));

    let boostScore = 0;
    let details = '';

    if (daysUntil <= 0) {
      // Past events get very low score
      boostScore = 5;
      details = `Past event (${Math.abs(daysUntil)} days ago)`;
    } else if (daysUntil <= 3) {
      // Immediate events get highest boost
      boostScore = 100;
      details = `Immediate event (${daysUntil} days away)`;
    } else if (daysUntil <= 7) {
      // This week events get high boost
      boostScore = 85;
      details = `This week (${daysUntil} days away)`;
    } else if (daysUntil <= 14) {
      // Next week events get medium boost
      boostScore = 70;
      details = `Next week (${daysUntil} days away)`;
    } else if (daysUntil <= 30) {
      // This month events get lower boost
      boostScore = 40;
      details = `This month (${daysUntil} days away)`;
    } else {
      // Future events get minimal boost
      boostScore = 10;
      details = `Future event (${daysUntil} days away)`;
    }

    return {
      score: boostScore,
      details,
      daysUntil
    };
  }

  // PRESERVED: Calculate popularity boost (exact copy)
  calculatePopularityBoost(event) {
    if (!event.artists || event.artists.length === 0) {
      return { score: 30, details: 'No artists for popularity check' };
    }

    let maxPopularity = 0;
    let popularArtist = '';
    let cityBonus = 1.0;

    // Check artist popularity
    event.artists.forEach(artist => {
      const normalizedArtist = artist.toLowerCase().trim();
      const popularity = this.artistPopularity.get(normalizedArtist) || 0;
      
      if (popularity > maxPopularity) {
        maxPopularity = popularity;
        popularArtist = artist;
      }
    });

    // Apply city-specific trending bonus
    if (event.venue?.city) {
      const cityKey = event.venue.city.toLowerCase().trim();
      cityBonus = this.cityTrendingBonus.get(cityKey) || 1.0;
    }

    // Calculate final popularity score
    const baseScore = maxPopularity || 50; // Default to 50 for unknown artists
    const finalScore = Math.min(100, baseScore * cityBonus);

    let details = '';
    if (maxPopularity > 0) {
      details = `${popularArtist}: ${maxPopularity}% popularity`;
      if (cityBonus > 1.0) {
        details += ` × ${cityBonus} city bonus = ${Math.round(finalScore)}%`;
      }
    } else {
      details = `Unknown artists (default: ${Math.round(finalScore)}%)`;
    }

    return {
      score: finalScore,
      details,
      artistPopularity: maxPopularity,
      cityBonus
    };
  }

  // PRESERVED: Calculate distance-based geo penalty (exact copy)
  calculateGeoPenalty(event) {
    // For now, return neutral score since we don't have user location in worker
    // This will be enhanced when user location data is available
    
    // Default implementation - no penalty for local events
    const defaultDistance = 50; // Assume 50km average distance
    
    if (defaultDistance <= 100) {
      return {
        score: 0, // No penalty for nearby events
        details: `Local event (estimated ${defaultDistance}km)`,
        distance: defaultDistance
      };
    }

    // Calculate penalty for distant events
    const penaltyPercentage = Math.min(10, Math.floor(defaultDistance / 100));
    
    return {
      score: -penaltyPercentage, // Negative score for penalty
      details: `Distance penalty: -${penaltyPercentage}% (${defaultDistance}km)`,
      distance: defaultDistance
    };
  }

  // ENHANCED: Calculate confidence based on data completeness (enhanced with sound)
  calculateConfidence(event, scoreBreakdown) {
    let confidenceScore = 0;

    // Data availability factors
    if (event.artists && event.artists.length > 0) confidenceScore += 20;
    if (event.genres && event.genres.length > 0) confidenceScore += 20;
    if (event.date) confidenceScore += 15;
    if (event.venue?.name) confidenceScore += 10;
    if (event.venue?.city) confidenceScore += 10;

    // Scoring quality factors
    if (scoreBreakdown.genre?.score > 50) confidenceScore += 10;
    if (scoreBreakdown.artist?.score > 50) confidenceScore += 10;
    if (scoreBreakdown.recency?.score > 50) confidenceScore += 5;

    // NEW: Sound characteristics confidence boost
    if (scoreBreakdown.sound && scoreBreakdown.sound.confidence > 0.7) {
      confidenceScore += 10; // Bonus for high-quality sound data
    }

    return Math.min(100, confidenceScore);
  }

  // NEW: Get service statistics
  getServiceStats() {
    const audioFeaturesStats = this.audioFeaturesService ? this.audioFeaturesService.getStats() : null;
    
    return {
      enabled: this.enabled,
      soundCharacteristicsEnabled: this.soundCharacteristicsEnabled,
      version: this.version,
      audioFeatures: audioFeaturesStats
    };
  }
}

module.exports = { RecommendationEnhancer };

