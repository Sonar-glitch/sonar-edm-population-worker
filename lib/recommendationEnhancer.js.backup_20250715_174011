// SURGICAL ADDITION: lib/recommendationEnhancer.js (FIXED VERSION)
// Minimal recommendation enhancement for events pipeline
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

    // Known artists with their actual genres (FIXED: More comprehensive)
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
      
      // NON-EDM Artists (FIXED: Proper genre classification)
      ['kid koala', { genre: 'hip hop', weight: 0.1 }],
      ['chris botti', { genre: 'jazz', weight: 0.0 }],
      ['drake', { genre: 'hip hop', weight: 0.0 }],
      ['coldplay', { genre: 'rock', weight: 0.0 }],
      ['miles davis', { genre: 'jazz', weight: 0.0 }],
      ['john coltrane', { genre: 'jazz', weight: 0.0 }],
      ['the beatles', { genre: 'rock', weight: 0.0 }],
      ['taylor swift', { genre: 'pop', weight: 0.2 }]
    ]);
  }

  // SURGICAL: Only enhance events that need enhancement
  needsEnhancement(event) {
    const alreadyProcessed = event.enhancementProcessed === true;
    const hasOurScore = event.recommendationMetrics?.tasteScore !== undefined;
    return !alreadyProcessed && !hasOurScore;
  }

  // SURGICAL: Minimal enhancement processing
  async enhanceEvent(event) {
    if (!this.enabled || !this.needsEnhancement(event)) {
      return { ...event, enhancementProcessed: false, enhancementSkipped: true };
    }

    try {
      // Stage 1: Artist extraction
      const artistEnhanced = this.extractArtists(event);
      
      // Stage 2: Genre detection (FIXED: Artist-first approach)
      const genreEnhanced = this.detectGenres(artistEnhanced);
      
      // Stage 3: Recommendation scoring
      const scoreEnhanced = this.calculateRecommendationScore(genreEnhanced);

      return {
        ...scoreEnhanced,
        enhancementProcessed: true,
        enhancementMetadata: {
          processedAt: new Date(),
          version: '1.1', // Updated version
          stages: ['artist_extraction', 'genre_detection', 'recommendation_scoring']
        }
      };
    } catch (error) {
      console.warn(`Enhancement failed for ${event.name}:`, error.message);
      return { ...event, enhancementProcessed: false, enhancementError: error.message };
    }
  }

  // Extract artists from event data
  extractArtists(event) {
    let artists = [];

    // FIXED: Use artistList first (array of strings)
    if (event.artistList && Array.isArray(event.artistList)) {
      artists = [...event.artistList];
    }
    // FIXED: Extract from artists array (array of objects)  
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

  // FIXED: Detect genres using ARTIST-FIRST approach
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

    // FIXED: Strong non-EDM genres override everything
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

  // Calculate recommendation score
  calculateRecommendationScore(event) {
    let tasteScore = 0;
    const scoreBreakdown = {};

    // Genre-based scoring (60% weight)
    const genreScore = this.calculateGenreScore(event);
    tasteScore += genreScore.score * 0.6;
    scoreBreakdown.genre = genreScore;

    // Artist-based scoring (30% weight)
    const artistScore = this.calculateArtistScore(event);
    tasteScore += artistScore.score * 0.3;
    scoreBreakdown.artist = artistScore;

    // Venue-based scoring (10% weight)
    const venueScore = this.calculateVenueScore(event);
    tasteScore += venueScore.score * 0.1;
    scoreBreakdown.venue = venueScore;

    // Normalize to 0-100 scale
    const finalScore = Math.max(0, Math.min(100, Math.round(tasteScore)));

    return {
      ...event,
      recommendationMetrics: {
        tasteScore: finalScore,
        scoreBreakdown,
        confidence: this.calculateConfidence(event, scoreBreakdown),
        calculatedAt: new Date(),
        version: '1.1'
      }
    };
  }

  calculateGenreScore(event) {
    if (!event.primaryGenre || event.primaryGenre === 'unknown') {
      return { score: 10, details: 'No primary genre' };
    }

    const primaryWeight = this.edmGenreWeights.get(event.primaryGenre.toLowerCase()) || 0;
    
    // FIXED: Heavily penalize non-EDM primary genres
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

  calculateVenueScore(event) {
    if (!event.venue?.name) {
      return { score: 50, details: 'No venue information' };
    }

    const venueName = event.venue.name.toLowerCase();
    
    // EDM venues get higher scores
    if (venueName.includes('rebel') || venueName.includes('coda') || venueName.includes('electric')) {
      return { score: 90, details: 'EDM venue' };
    }
    
    // Generic venue types
    if (venueName.includes('club') || venueName.includes('nightclub')) {
      return { score: 80, details: 'Nightclub venue' };
    }
    
    return { score: 50, details: 'Generic venue' };
  }

  calculateConfidence(event, scoreBreakdown) {
    const confidences = Object.values(scoreBreakdown).map(s => 70); // Default confidence
    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    
    // Adjust based on data completeness
    let completenessBonus = 0;
    if (event.artists && event.artists.length > 0) completenessBonus += 10;
    if (event.genres && event.genres.length > 0) completenessBonus += 10;
    if (event.venue?.name) completenessBonus += 5;
    
    return Math.min(100, avgConfidence + completenessBonus);
  }
}

module.exports = { RecommendationEnhancer };
