// PHASE 2 DEPLOYMENT: lib/recommendationEnhancer.js - Enhanced with Artist Profile Service Integration
// Enhanced recommendation enhancement for events pipeline with sound characteristics generation
// Memory-optimized for Basic dyno (512MB)
// TIKO PRESERVATION PROTOCOL: Surgical modifications only - add to, don't replace

// NEW: Import artist profile service for sound characteristics generation
const ArtistProfileService = require('./artistProfileService');

class RecommendationEnhancer {
  constructor() {
    this.enabled = process.env.RECOMMENDATION_ENHANCEMENT_ENABLED === 'true';
    this.version = '4.0.0'; // Phase 2 deployment version with artist profiling

    // NEW: Initialize artist profile service
    this.artistProfileService = new ArtistProfileService();

    // PRESERVED: All existing EDM genre weights
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

    // PRESERVED: Known artists with their actual genres
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

      // NON-EDM Artists
      ['kid koala', { genre: 'hip hop', weight: 0.1 }],
      ['chris botti', { genre: 'jazz', weight: 0.0 }],
      ['drake', { genre: 'hip hop', weight: 0.0 }],
      ['coldplay', { genre: 'rock', weight: 0.0 }],
      ['miles davis', { genre: 'jazz', weight: 0.0 }],
      ['john coltrane', { genre: 'jazz', weight: 0.0 }],
      ['the beatles', { genre: 'rock', weight: 0.0 }],
      ['taylor swift', { genre: 'pop', weight: 0.2 }]
    ]);

    // PRESERVED: Artist popularity data
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

    // PRESERVED: City-specific trending bonus
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

    // PRESERVED: Enhanced genre matrix for similarity calculations
    this.enhancedGenreMatrix = this.initializeEnhancedGenreMatrix();

    // PRESERVED: Sound characteristics profiles for genres
    this.genreAudioProfiles = this.initializeGenreAudioProfiles();

    // PRESERVED: Artist sound characteristics
    this.artistAudioProfiles = this.initializeArtistAudioProfiles();

    console.log(`🚀 RecommendationEnhancer v${this.version} initialized (Phase 2 Enhanced with Artist Profiling)`);
    console.log(`   Enhancement enabled: ${this.enabled}`);
    console.log(`   Artist profile service: ${!!this.artistProfileService}`);
    console.log(`   Enhanced genre matrix: ${this.enhancedGenreMatrix.size} genres`);
    console.log(`   Genre audio profiles: ${Object.keys(this.genreAudioProfiles).length} profiles`);
    console.log(`   Artist audio profiles: ${this.artistAudioProfiles.size} profiles`);
  }

  // PRESERVED: Initialize enhanced genre matrix for similarity calculations
  initializeEnhancedGenreMatrix() {
    const matrix = new Map();
    
    // Core EDM genre families with similarity scores
    const edmFamilies = {
      house: ['house', 'deep house', 'tech house', 'progressive house', 'electro house', 'future house', 'big room'],
      techno: ['techno', 'minimal techno', 'acid techno', 'industrial techno'],
      trance: ['trance', 'progressive trance', 'uplifting trance', 'psytrance'],
      electronic: ['electronic', 'electronica', 'ambient', 'downtempo', 'chillout'],
      bass: ['dubstep', 'drum and bass', 'dnb', 'trap', 'future bass'],
      dance: ['dance', 'edm', 'electro', 'disco', 'funk']
    };

    // Calculate similarity scores within families (high similarity)
    Object.values(edmFamilies).forEach(family => {
      family.forEach(genre1 => {
        family.forEach(genre2 => {
          if (genre1 !== genre2) {
            matrix.set(`${genre1}:${genre2}`, 0.8); // High similarity within family
          } else {
            matrix.set(`${genre1}:${genre2}`, 1.0); // Perfect match
          }
        });
      });
    });

    // Calculate cross-family similarities (medium similarity)
    const crossFamilySimilarities = [
      ['house', 'techno', 0.6],
      ['house', 'trance', 0.5],
      ['techno', 'electronic', 0.7],
      ['electronic', 'ambient', 0.8],
      ['dubstep', 'trap', 0.7],
      ['dance', 'house', 0.7]
    ];

    crossFamilySimilarities.forEach(([family1, family2, similarity]) => {
      const genres1 = edmFamilies[family1] || [family1];
      const genres2 = edmFamilies[family2] || [family2];
      
      genres1.forEach(genre1 => {
        genres2.forEach(genre2 => {
          matrix.set(`${genre1}:${genre2}`, similarity);
          matrix.set(`${genre2}:${genre1}`, similarity);
        });
      });
    });

    return matrix;
  }

  // PRESERVED: Initialize genre audio profiles for sound characteristics
  initializeGenreAudioProfiles() {
    return {
      // ========================================
      // EXISTING EDM GENRES (PRESERVED EXACTLY)
      // ========================================
      
      // House family
      'house': { energy: 0.75, danceability: 0.85, valence: 0.65, tempo: 125, acousticness: 0.05, instrumentalness: 0.70 },
      'deep house': { energy: 0.65, danceability: 0.80, valence: 0.55, tempo: 122, acousticness: 0.08, instrumentalness: 0.75 },
      'tech house': { energy: 0.80, danceability: 0.85, valence: 0.50, tempo: 128, acousticness: 0.03, instrumentalness: 0.80 },
      'progressive house': { energy: 0.70, danceability: 0.75, valence: 0.60, tempo: 128, acousticness: 0.05, instrumentalness: 0.65 },
      'electro house': { energy: 0.85, danceability: 0.90, valence: 0.70, tempo: 128, acousticness: 0.02, instrumentalness: 0.60 },
      'future house': { energy: 0.80, danceability: 0.85, valence: 0.65, tempo: 126, acousticness: 0.03, instrumentalness: 0.70 },
      'big room': { energy: 0.95, danceability: 0.90, valence: 0.75, tempo: 128, acousticness: 0.01, instrumentalness: 0.50 },

      // Techno family
      'techno': { energy: 0.85, danceability: 0.80, valence: 0.35, tempo: 132, acousticness: 0.02, instrumentalness: 0.85 },
      'minimal techno': { energy: 0.75, danceability: 0.75, valence: 0.25, tempo: 130, acousticness: 0.03, instrumentalness: 0.90 },
      'acid techno': { energy: 0.90, danceability: 0.85, valence: 0.30, tempo: 135, acousticness: 0.01, instrumentalness: 0.85 },

      // Trance family
      'trance': { energy: 0.80, danceability: 0.75, valence: 0.70, tempo: 138, acousticness: 0.03, instrumentalness: 0.60 },
      'progressive trance': { energy: 0.75, danceability: 0.70, valence: 0.65, tempo: 132, acousticness: 0.04, instrumentalness: 0.70 },
      'uplifting trance': { energy: 0.85, danceability: 0.80, valence: 0.80, tempo: 140, acousticness: 0.02, instrumentalness: 0.55 },

      // Electronic family
      'electronic': { energy: 0.60, danceability: 0.65, valence: 0.50, tempo: 115, acousticness: 0.10, instrumentalness: 0.75 },
      'electronica': { energy: 0.55, danceability: 0.60, valence: 0.45, tempo: 110, acousticness: 0.12, instrumentalness: 0.80 },
      'ambient': { energy: 0.25, danceability: 0.30, valence: 0.40, tempo: 90, acousticness: 0.25, instrumentalness: 0.90 },
      'downtempo': { energy: 0.35, danceability: 0.40, valence: 0.45, tempo: 95, acousticness: 0.20, instrumentalness: 0.85 },
      'chillout': { energy: 0.30, danceability: 0.35, valence: 0.50, tempo: 85, acousticness: 0.30, instrumentalness: 0.80 },

      // Bass family
      'dubstep': { energy: 0.90, danceability: 0.85, valence: 0.40, tempo: 140, acousticness: 0.01, instrumentalness: 0.70 },
      'drum and bass': { energy: 0.95, danceability: 0.90, valence: 0.45, tempo: 175, acousticness: 0.01, instrumentalness: 0.80 },
      'dnb': { energy: 0.95, danceability: 0.90, valence: 0.45, tempo: 175, acousticness: 0.01, instrumentalness: 0.80 },
      'trap': { energy: 0.85, danceability: 0.80, valence: 0.35, tempo: 140, acousticness: 0.02, instrumentalness: 0.60 },
      'future bass': { energy: 0.80, danceability: 0.85, valence: 0.60, tempo: 150, acousticness: 0.03, instrumentalness: 0.65 },

      // Dance family
      'dance': { energy: 0.80, danceability: 0.90, valence: 0.70, tempo: 120, acousticness: 0.05, instrumentalness: 0.50 },
      'edm': { energy: 0.85, danceability: 0.90, valence: 0.70, tempo: 128, acousticness: 0.03, instrumentalness: 0.60 },
      'electro': { energy: 0.80, danceability: 0.85, valence: 0.60, tempo: 125, acousticness: 0.04, instrumentalness: 0.70 },
      'disco': { energy: 0.75, danceability: 0.95, valence: 0.80, tempo: 115, acousticness: 0.10, instrumentalness: 0.30 },
      'funk': { energy: 0.70, danceability: 0.90, valence: 0.75, tempo: 110, acousticness: 0.15, instrumentalness: 0.40 },

      // ========================================
      // NEW NON-EDM GENRES (ADDED FOR COMPREHENSIVE COVERAGE)
      // ========================================

      // Pop family
      'pop': { energy: 0.65, danceability: 0.70, valence: 0.70, tempo: 120, acousticness: 0.15, instrumentalness: 0.10 },
      'indie pop': { energy: 0.60, danceability: 0.65, valence: 0.65, tempo: 115, acousticness: 0.20, instrumentalness: 0.15 },
      'synth pop': { energy: 0.70, danceability: 0.75, valence: 0.70, tempo: 125, acousticness: 0.10, instrumentalness: 0.30 },

      // Rock family
      'rock': { energy: 0.80, danceability: 0.50, valence: 0.50, tempo: 120, acousticness: 0.05, instrumentalness: 0.20 },
      'alternative rock': { energy: 0.75, danceability: 0.45, valence: 0.45, tempo: 115, acousticness: 0.08, instrumentalness: 0.25 },
      'indie rock': { energy: 0.70, danceability: 0.50, valence: 0.55, tempo: 110, acousticness: 0.12, instrumentalness: 0.30 },
      'hard rock': { energy: 0.90, danceability: 0.55, valence: 0.40, tempo: 130, acousticness: 0.02, instrumentalness: 0.15 },
      'metal': { energy: 0.95, danceability: 0.40, valence: 0.25, tempo: 140, acousticness: 0.01, instrumentalness: 0.20 },

      // Hip Hop family
      'hip hop': { energy: 0.70, danceability: 0.80, valence: 0.50, tempo: 95, acousticness: 0.05, instrumentalness: 0.05 },
      'rap': { energy: 0.75, danceability: 0.75, valence: 0.45, tempo: 100, acousticness: 0.03, instrumentalness: 0.02 },

      // Jazz family
      'jazz': { energy: 0.45, danceability: 0.55, valence: 0.60, tempo: 120, acousticness: 0.40, instrumentalness: 0.70 },
      'smooth jazz': { energy: 0.35, danceability: 0.45, valence: 0.65, tempo: 100, acousticness: 0.50, instrumentalness: 0.80 },
      'bebop': { energy: 0.60, danceability: 0.40, valence: 0.50, tempo: 140, acousticness: 0.35, instrumentalness: 0.85 },

      // Classical family
      'classical': { energy: 0.40, danceability: 0.20, valence: 0.50, tempo: 80, acousticness: 0.80, instrumentalness: 0.95 },
      'orchestral': { energy: 0.50, danceability: 0.15, valence: 0.55, tempo: 90, acousticness: 0.85, instrumentalness: 0.98 },

      // Folk family
      'folk': { energy: 0.35, danceability: 0.40, valence: 0.60, tempo: 90, acousticness: 0.70, instrumentalness: 0.30 },
      'acoustic': { energy: 0.30, danceability: 0.35, valence: 0.65, tempo: 85, acousticness: 0.85, instrumentalness: 0.40 },
      'country': { energy: 0.50, danceability: 0.60, valence: 0.70, tempo: 100, acousticness: 0.40, instrumentalness: 0.20 },

      // R&B/Soul family
      'r&b': { energy: 0.60, danceability: 0.75, valence: 0.65, tempo: 95, acousticness: 0.20, instrumentalness: 0.10 },
      'soul': { energy: 0.65, danceability: 0.80, valence: 0.70, tempo: 100, acousticness: 0.25, instrumentalness: 0.15 },

      // World music
      'reggae': { energy: 0.55, danceability: 0.85, valence: 0.75, tempo: 90, acousticness: 0.30, instrumentalness: 0.25 },
      'latin': { energy: 0.75, danceability: 0.90, valence: 0.80, tempo: 110, acousticness: 0.20, instrumentalness: 0.20 },
      'world': { energy: 0.50, danceability: 0.70, valence: 0.65, tempo: 100, acousticness: 0.40, instrumentalness: 0.40 }
    };
  }

  // PRESERVED: Initialize artist audio profiles
  initializeArtistAudioProfiles() {
    const profiles = new Map();
    
    // EDM Artists with detailed profiles
    profiles.set('deadmau5', {
      energy: 0.72, danceability: 0.78, valence: 0.55,
      acousticness: 0.05, instrumentalness: 0.85, tempo: 126,
      confidence: 0.9, genre: 'progressive house'
    });
    
    profiles.set('calvin harris', {
      energy: 0.85, danceability: 0.90, valence: 0.70,
      acousticness: 0.02, instrumentalness: 0.60, tempo: 128,
      confidence: 0.9, genre: 'electro house'
    });
    
    profiles.set('tiësto', {
      energy: 0.80, danceability: 0.75, valence: 0.70,
      acousticness: 0.03, instrumentalness: 0.60, tempo: 138,
      confidence: 0.9, genre: 'trance'
    });

    // Non-EDM Artists
    profiles.set('taylor swift', {
      energy: 0.65, danceability: 0.70, valence: 0.70,
      acousticness: 0.15, instrumentalness: 0.10, tempo: 120,
      confidence: 0.8, genre: 'pop'
    });

    profiles.set('coldplay', {
      energy: 0.75, danceability: 0.50, valence: 0.50,
      acousticness: 0.08, instrumentalness: 0.25, tempo: 115,
      confidence: 0.8, genre: 'alternative rock'
    });

    return profiles;
  }

  // ENHANCED: Main enhancement method with artist profiling
  async enhanceEvents(events, options = {}) {
    if (!this.enabled) {
      console.log('⚠️ RecommendationEnhancer disabled, returning events unchanged');
      return events;
    }

    const startTime = Date.now();
    console.log(`🔧 Enhancing ${events.length} events with artist profiling...`);

    const enhancedEvents = [];
    let artistProfilesGenerated = 0;
    let artistProfilesFromCache = 0;
    let artistProfilesFailed = 0;

    for (const event of events) {
      try {
        const enhancedEvent = await this.enhanceEventWithArtistData(event, options);
        enhancedEvents.push(enhancedEvent);

        // Track artist profiling statistics
        if (enhancedEvent.artists) {
          for (const artist of enhancedEvent.artists) {
            if (artist.soundCharacteristics) {
              if (artist.soundCharacteristics.metadata?.source?.includes('apple') || 
                  artist.soundCharacteristics.metadata?.source?.includes('reccobeats')) {
                artistProfilesGenerated++;
              } else {
                artistProfilesFromCache++;
              }
            } else {
              artistProfilesFailed++;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error enhancing event ${event._id}:`, error.message);
        enhancedEvents.push(event); // Return original event on error
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ Event enhancement complete:`, {
      totalEvents: events.length,
      processingTime: `${processingTime}ms`,
      artistProfilesGenerated,
      artistProfilesFromCache,
      artistProfilesFailed,
      averageTimePerEvent: `${Math.round(processingTime / events.length)}ms`
    });

    return enhancedEvents;
  }

  // NEW: Enhanced event processing with artist sound characteristics
  async enhanceEventWithArtistData(event, options = {}) {
    // PRESERVED: All existing enhancement logic
    const enhancedEvent = { ...event };

    // Add existing metadata enhancements
    enhancedEvent.enhancedGenres = this.extractEnhancedGenres(event);
    enhancedEvent.artistMetadata = this.extractArtistMetadata(event);
    enhancedEvent.venueMetadata = this.extractVenueMetadata(event);
    enhancedEvent.temporalMetadata = this.extractTemporalMetadata(event);

    // NEW: Add sound characteristics for each artist
    if (event.artists && event.artists.length > 0) {
      const enhancedArtists = [];

      for (const artist of event.artists) {
        const enhancedArtist = { ...artist };

        try {
          // Generate artist profile using the new service
          const profile = await this.artistProfileService.generateArtistProfile(artist.name, {
            trackLimit: 8, // Limit tracks for performance
            userPreferences: options.userPreferences || { primaryGenre: 'electronic' },
            cacheResults: true
          });

          if (profile && profile.confidence > 0.3) {
            // Add matrix-based sound characteristics
            enhancedArtist.soundCharacteristics = {
              current: profile.soundCharacteristics,
              metadata: {
                confidence: profile.confidence,
                source: profile.source,
                tracksAnalyzed: profile.tracksAnalyzed || 0,
                lastUpdated: new Date(),
                genreFamily: profile.genreFamily,
                folkPenaltyApplied: profile.folkPenaltyApplied || false,
                processingSteps: profile.processingSteps || []
              }
            };

            console.log(`🎵 Generated sound characteristics for ${artist.name}:`, {
              confidence: profile.confidence,
              source: profile.source,
              genreFamily: profile.genreFamily
            });
          } else {
            // Fallback to existing genre-based characteristics
            const fallbackCharacteristics = this.getFallbackCharacteristics(artist.name, enhancedEvent.enhancedGenres);
            if (fallbackCharacteristics) {
              enhancedArtist.soundCharacteristics = {
                current: fallbackCharacteristics,
                metadata: {
                  confidence: 0.4,
                  source: 'genre_fallback',
                  tracksAnalyzed: 0,
                  lastUpdated: new Date(),
                  genreFamily: this.determineGenreFamily(enhancedEvent.enhancedGenres),
                  folkPenaltyApplied: false,
                  processingSteps: ['Genre-based fallback']
                }
              };
            }
          }
        } catch (error) {
          console.warn(`⚠️ Artist profiling failed for ${artist.name}:`, error.message);
          
          // Fallback to existing genre-based characteristics
          const fallbackCharacteristics = this.getFallbackCharacteristics(artist.name, enhancedEvent.enhancedGenres);
          if (fallbackCharacteristics) {
            enhancedArtist.soundCharacteristics = {
              current: fallbackCharacteristics,
              metadata: {
                confidence: 0.3,
                source: 'error_fallback',
                tracksAnalyzed: 0,
                lastUpdated: new Date(),
                genreFamily: this.determineGenreFamily(enhancedEvent.enhancedGenres),
                folkPenaltyApplied: false,
                processingSteps: [`Error: ${error.message}`, 'Genre-based fallback']
              }
            };
          }
        }

        enhancedArtists.push(enhancedArtist);
      }

      enhancedEvent.artists = enhancedArtists;
    }

    return enhancedEvent;
  }

  // Bridge method for compatibility with enhance_existing_events.js worker
  async enhanceEvent(event, options = {}) {
    try {
      console.log(`🔧 Enhancing single event: "${event.name}"`);
      
      // Use the existing enhanceEventWithArtistData method
      const enhancedEvent = await this.enhanceEventWithArtistData(event, options);
      
      // Mark as processed
      enhancedEvent.enhancementProcessed = true;
      enhancedEvent.enhancementVersion = this.version;
      enhancedEvent.enhancementTimestamp = new Date();
      
      // Calculate personalized score using the same logic as phase1_event_enhancer
      enhancedEvent.personalizedScore = this.calculateBasicPersonalizedScore(enhancedEvent);
      
      console.log(`✅ Enhanced "${event.name}" -> Score: ${enhancedEvent.personalizedScore}%`);
      
      return enhancedEvent;
    } catch (error) {
      console.error(`❌ Failed to enhance event "${event.name}":`, error);
      
      // Return original event with error flag
      return {
        ...event,
        enhancementProcessed: false,
        enhancementError: error.message,
        enhancementTimestamp: new Date()
      };
    }
  }

  // Calculate basic personalized score (similar to phase1_event_enhancer.js)
  calculateBasicPersonalizedScore(event) {
    // FIRST: Use our proven music detection logic
    const isMusicEvent = this.detectMusicEvent(event);
    
    if (!isMusicEvent) {
      // Non-music events get very low scores (5-15%)
      console.log(`🚫 Non-music event detected: "${event.name}" -> Low score`);
      return Math.floor(Math.random() * 11) + 5; // Random 5-15%
    }
    
    // For music events, use enhanced RecommendationEnhancer logic
    let score = 50; // Base score
    
    // Enhanced genre contribution using RecommendationEnhancer's genre matrix
    if (event.enhancedGenres && event.enhancedGenres.length > 0) {
      let genreScore = 0;
      for (const genre of event.enhancedGenres) {
        const weight = this.edmGenreWeights.get(genre.toLowerCase()) || 0;
        genreScore += weight * 10; // Scale the weight
      }
      score += Math.min(25, genreScore); // Cap genre contribution at 25 points
    }
    
    // Artist metadata contribution using RecommendationEnhancer's artist data
    if (event.artistMetadata && event.artistMetadata.length > 0) {
      const avgEdmWeight = event.artistMetadata.reduce((sum, a) => sum + (a.weight || 0), 0) / event.artistMetadata.length;
      const avgPopularity = event.artistMetadata.reduce((sum, a) => sum + (a.popularity || 50), 0) / event.artistMetadata.length;
      
      score += (avgEdmWeight * 20); // EDM weight boost
      score += ((avgPopularity - 50) / 50) * 10; // Popularity adjustment
    } else if (event.artists && event.artists.length > 0) {
      // Fallback: simple artist count contribution
      score += Math.min(20, event.artists.length * 4);
    }
    
    // Venue metadata contribution
    const venueName = (typeof event.venue === 'object' ? event.venue?.name : event.venue || '').toLowerCase();
    if (venueName.includes('club') || venueName.includes('festival')) {
      score += 10;
    }
    
    // Temporal metadata contribution
    if (event.temporalMetadata) {
      if (event.temporalMetadata.isUpcoming && event.temporalMetadata.daysUntilEvent <= 14) {
        score += 5; // Upcoming events bonus
      }
      if (event.temporalMetadata.isWeekend) {
        score += 3; // Weekend bonus
      }
    }
    
    return Math.max(15, Math.min(95, Math.round(score)));
  }

  // Add music detection method to RecommendationEnhancer
  detectMusicEvent(event) {
    const eventText = (event.name + ' ' + (event.description || '')).toLowerCase();
    const venueName = (typeof event.venue === 'object' ? event.venue?.name : event.venue || '').toLowerCase();
    const fullText = eventText + ' ' + venueName;
    
    const musicKeywords = ['dj', 'music', 'concert', 'festival', 'electronic', 'house', 'techno', 'edm', 
                          'dance', 'bass', 'club', 'party', 'live music', 'band', 'artist', 'performance', 
                          'tour', 'show', 'live'];
    
    const nonMusicKeywords = ['admission', 'general admission', 'museum', 'exhibition', 'castle', 
                             'historic', 'tour', 'visit', 'sightseeing', 'gallery'];
    
    const musicMatches = musicKeywords.filter(word => fullText.includes(word));
    const nonMusicMatches = nonMusicKeywords.filter(word => fullText.includes(word));
    
    // Special handling for "general admission" - only non-music if no music context
    const hasGeneralAdmission = fullText.includes('general admission');
    if (hasGeneralAdmission && musicMatches.length === 0) {
      return false; // Clearly non-music general admission
    }
    
    // Return true if more music keywords than non-music keywords
    return musicMatches.length > nonMusicMatches.length;
  }

  // NEW: Get fallback characteristics from existing genre profiles
  getFallbackCharacteristics(artistName, genres) {
    // Handle undefined or empty artist names
    if (!artistName || typeof artistName !== 'string') {
      return this.getGenreBasedFallback(genres);
    }
    
    // Check if we have a known artist profile
    const knownProfile = this.artistAudioProfiles.get(artistName.toLowerCase());
    if (knownProfile) {
      return {
        energy: knownProfile.energy,
        danceability: knownProfile.danceability,
        valence: knownProfile.valence,
        tempo: knownProfile.tempo,
        acousticness: knownProfile.acousticness,
        instrumentalness: knownProfile.instrumentalness,
        speechiness: 0.05
      };
    }

    // Fallback to genre-based characteristics
    if (genres && genres.length > 0) {
      const primaryGenre = genres[0].toLowerCase();
      const genreProfile = this.genreAudioProfiles[primaryGenre];
      
      if (genreProfile) {
        return {
          energy: genreProfile.energy,
          danceability: genreProfile.danceability,
          valence: genreProfile.valence,
          tempo: genreProfile.tempo,
          acousticness: genreProfile.acousticness,
          instrumentalness: genreProfile.instrumentalness,
          speechiness: 0.05
        };
      }
    }

    // Final fallback - neutral characteristics
    return {
      energy: 0.5,
      danceability: 0.5,
      valence: 0.5,
      tempo: 120,
      acousticness: 0.5,
      instrumentalness: 0.5,
      speechiness: 0.05
    };
  }

  // Helper method for genre-based fallback when artist name is invalid
  getGenreBasedFallback(genres) {
    // Try genre-based characteristics if we have genres
    if (genres && genres.length > 0) {
      const primaryGenre = genres[0].toLowerCase();
      const genreProfile = this.genreAudioProfiles[primaryGenre];
      
      if (genreProfile) {
        return {
          energy: genreProfile.energy,
          danceability: genreProfile.danceability,
          valence: genreProfile.valence,
          tempo: genreProfile.tempo,
          acousticness: genreProfile.acousticness,
          instrumentalness: genreProfile.instrumentalness,
          speechiness: 0.05
        };
      }
    }

    // Final fallback - neutral characteristics
    return {
      energy: 0.5,
      danceability: 0.5,
      valence: 0.5,
      tempo: 120,
      acousticness: 0.5,
      instrumentalness: 0.5,
      speechiness: 0.05
    };
  }

  // NEW: Determine genre family for penalty application
  determineGenreFamily(genres) {
    if (!genres || genres.length === 0) return 'unknown';

    const genre = genres[0].toLowerCase();
    
    // Electronic family
    if (['house', 'techno', 'trance', 'electronic', 'edm', 'dubstep', 'drum and bass', 'ambient'].some(g => genre.includes(g))) {
      return 'electronic';
    }
    
    // Folk/Acoustic family
    if (['folk', 'acoustic', 'country'].some(g => genre.includes(g))) {
      return 'folk_acoustic';
    }
    
    // Rock family
    if (['rock', 'metal', 'punk'].some(g => genre.includes(g))) {
      return 'rock';
    }
    
    // Pop family
    if (['pop'].some(g => genre.includes(g))) {
      return 'pop';
    }
    
    // Hip-hop family
    if (['hip hop', 'rap'].some(g => genre.includes(g))) {
      return 'hip_hop';
    }
    
    return 'other';
  }

  // PRESERVED: All existing methods (extractEnhancedGenres, extractArtistMetadata, etc.)
  extractEnhancedGenres(event) {
    const genres = new Set();
    
    // Extract from event name
    if (event.name) {
      const eventName = event.name.toLowerCase();
      for (const [genre] of this.edmGenreWeights) {
        if (eventName.includes(genre)) {
          genres.add(genre);
        }
      }
    }
    
    // Extract from classifications
    if (event.classifications) {
      event.classifications.forEach(classification => {
        if (classification.genre && classification.genre.name) {
          const genreName = classification.genre.name.toLowerCase();
          genres.add(genreName);
          
          // Map to known EDM genres
          for (const [edmGenre] of this.edmGenreWeights) {
            if (genreName.includes(edmGenre) || edmGenre.includes(genreName)) {
              genres.add(edmGenre);
            }
          }
        }
      });
    }
    
    return Array.from(genres);
  }

  extractArtistMetadata(event) {
    const artists = [];
    
    if (event.artists) {
      event.artists.forEach(artist => {
        // Handle both string and object artist formats
        const artistName = (typeof artist === 'object' ? artist.name : artist) || '';
        if (!artistName) return; // Skip empty artist names
        
        const artistNameLower = artistName.toLowerCase();
        const knownArtist = this.artistGenres.get(artistNameLower);
        const popularity = this.artistPopularity.get(artistNameLower) || 50;
        
        artists.push({
          name: artistName,
          genre: knownArtist ? knownArtist.genre : 'unknown',
          weight: knownArtist ? knownArtist.weight : 0.5,
          popularity: popularity,
          isEDM: knownArtist ? knownArtist.weight > 0.5 : false
        });
      });
    }
    
    return artists;
  }

  extractVenueMetadata(event) {
    if (!event._embedded || !event._embedded.venues || !event._embedded.venues[0]) {
      return null;
    }
    
    const venue = event._embedded.venues[0];
    return {
      name: venue.name,
      capacity: venue.capacity || 'unknown',
      city: venue.city ? venue.city.name : 'unknown',
      country: venue.country ? venue.country.name : 'unknown'
    };
  }

  extractTemporalMetadata(event) {
    const now = new Date();
    
    // Handle different date formats in the event object
    let eventDate;
    if (event.dates && event.dates.start && event.dates.start.localDate) {
      eventDate = new Date(event.dates.start.localDate);
    } else if (event.date) {
      eventDate = new Date(event.date);
    } else if (event.startDate) {
      eventDate = new Date(event.startDate);
    } else {
      // Default to current date if no date found
      eventDate = now;
    }
    
    const daysUntilEvent = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
    
    return {
      daysUntilEvent: daysUntilEvent,
      isUpcoming: daysUntilEvent > 0,
      isWeekend: eventDate.getDay() === 0 || eventDate.getDay() === 6,
      month: eventDate.getMonth() + 1,
      season: this.getSeason(eventDate.getMonth() + 1)
    };
  }

  getSeason(month) {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
  }

  // NEW: Get health status including artist profiling metrics
  getHealthStatus() {
    const artistProfileHealth = this.artistProfileService ? this.artistProfileService.getHealthStatus() : null;
    
    return {
      version: this.version,
      enabled: this.enabled,
      enhancedGenreMatrix: this.enhancedGenreMatrix.size,
      genreAudioProfiles: Object.keys(this.genreAudioProfiles).length,
      artistAudioProfiles: this.artistAudioProfiles.size,
      artistProfileService: {
        available: !!this.artistProfileService,
        health: artistProfileHealth
      }
    };
  }
}

module.exports = RecommendationEnhancer;

