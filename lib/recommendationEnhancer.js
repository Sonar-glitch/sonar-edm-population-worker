// ENHANCED: lib/recommendationEnhancer.js (MUSIC TASTE ALGORITHM ENHANCEMENT)
// Enhanced recommendation enhancement for events pipeline with new scoring factors
// Memory-optimized for Basic dyno (512MB)

class RecommendationEnhancer {
  constructor() {
    this.enabled = process.env.RECOMMENDATION_ENHANCEMENT_ENABLED === 'true';

    // EDM genre weights for scoring
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

    // Known artists with their actual genres (PRESERVED: More comprehensive)
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

    // NEW: Artist popularity data (expandable)
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

    // NEW: City-specific trending bonus (expandable)
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
  }

  // PRESERVED: Only enhance events that need enhancement
  needsEnhancement(event) {
    const alreadyProcessed = event.enhancementProcessed === true;
    const hasOurScore = event.recommendationMetrics?.tasteScore !== undefined;
    return !alreadyProcessed && !hasOurScore;
  }

  // ENHANCED: Minimal enhancement processing with new scoring factors
  async enhanceEvent(event) {
    if (!this.enabled || !this.needsEnhancement(event)) {
      return { ...event, enhancementProcessed: false, enhancementSkipped: true };
    }

    try {
      // Stage 1: Artist extraction (PRESERVED)
      const artistEnhanced = this.extractArtists(event);

      // Stage 2: Genre detection (PRESERVED: Artist-first approach)
      const genreEnhanced = this.detectGenres(artistEnhanced);

      // Stage 3: ENHANCED recommendation scoring with new factors
      const scoreEnhanced = this.calculateEnhancedRecommendationScore(genreEnhanced);

      return {
        ...scoreEnhanced,
        enhancementProcessed: true,
        enhancementMetadata: {
          processedAt: new Date(),
          version: '2.0', // Updated version for enhanced algorithm
          stages: ['artist_extraction', 'genre_detection', 'enhanced_recommendation_scoring']
        }
      };
    } catch (error) {
      console.warn(`Enhancement failed for ${event.name}:`, error.message);
      return { ...event, enhancementProcessed: false, enhancementError: error.message };
    }
  }

  // PRESERVED: Extract artists from event data
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

  // PRESERVED: Parse artists from event names
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

  // PRESERVED: Detect genres using ARTIST-FIRST approach
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

  // PRESERVED: Map Ticketmaster genres
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

  // NEW: Enhanced recommendation score calculation with new factors
  calculateEnhancedRecommendationScore(event) {
    let tasteScore = 0;
    const scoreBreakdown = {};

    // ENHANCED WEIGHTS: Genre (35%) + Artist (30%) + Recency (15%) + Popularity (10%) + Geo (-10%)

    // 1. Genre-based scoring (35% weight - REDUCED from 60%)
    const genreScore = this.calculateGenreScore(event);
    tasteScore += genreScore.score * 0.35;
    scoreBreakdown.genre = { ...genreScore, weight: 35 };

    // 2. Artist-based scoring (30% weight - SAME)
    const artistScore = this.calculateArtistScore(event);
    tasteScore += artistScore.score * 0.30;
    scoreBreakdown.artist = { ...artistScore, weight: 30 };

    // 3. NEW: Recency boost (15% weight)
    const recencyBoost = this.calculateRecencyBoost(event);
    tasteScore += recencyBoost.score * 0.15;
    scoreBreakdown.recency = { ...recencyBoost, weight: 15 };

    // 4. NEW: Popularity boost (10% weight)
    const popularityBoost = this.calculatePopularityBoost(event);
    tasteScore += popularityBoost.score * 0.10;
    scoreBreakdown.popularity = { ...popularityBoost, weight: 10 };

    // 5. NEW: Geo penalty (-10% weight)
    const geoPenalty = this.calculateGeoPenalty(event);
    tasteScore += geoPenalty.score * 0.10; // Note: geoPenalty.score is already negative
    scoreBreakdown.geo = { ...geoPenalty, weight: -10 };

    // 6. PRESERVED: Venue-based scoring (REMOVED - replaced by new factors)
    // Venue scoring is now absorbed into the other factors

    // Normalize to 0-100 scale with improved bounds
    const finalScore = Math.max(20, Math.min(100, Math.round(tasteScore)));

    return {
      ...event,
      recommendationMetrics: {
        tasteScore: finalScore,
        scoreBreakdown,
        confidence: this.calculateConfidence(event, scoreBreakdown),
        calculatedAt: new Date(),
        version: '2.0', // Enhanced version
        algorithm: 'enhanced_multi_factor'
      }
    };
  }

  // PRESERVED: Calculate genre score
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

  // PRESERVED: Calculate artist score
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

  // NEW: Calculate tiered recency boost
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

  // NEW: Calculate popularity boost
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

  // NEW: Calculate distance-based geo penalty
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

  // ENHANCED: Calculate confidence based on data completeness
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

    return Math.min(100, confidenceScore);
  }
}

module.exports = { RecommendationEnhancer };

