// PHASE 1 DEPLOYMENT: lib/recommendationEnhancer.js - Enhanced User Taste Scoring
// Enhanced recommendation enhancement for events pipeline with metadata extraction
// Memory-optimized for Basic dyno (512MB)
// TIKO PRESERVATION PROTOCOL: Surgical modifications only - add to, don't replace

class RecommendationEnhancer {
  constructor() {
    this.enabled = process.env.RECOMMENDATION_ENHANCEMENT_ENABLED === 'true';
    this.version = '3.0.0'; // Phase 1 deployment version

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

    // NEW: Enhanced genre matrix for similarity calculations (Phase 1 Addition)
    this.enhancedGenreMatrix = this.initializeEnhancedGenreMatrix();

    // NEW: Sound characteristics profiles for genres (Phase 1 Addition)
    this.genreAudioProfiles = this.initializeGenreAudioProfiles();

    // NEW: Artist sound characteristics (Phase 1 Addition)
    this.artistAudioProfiles = this.initializeArtistAudioProfiles();

    console.log(`🚀 RecommendationEnhancer v${this.version} initialized (Phase 1 Enhanced)`);
    console.log(`   Enhancement enabled: ${this.enabled}`);
    console.log(`   Enhanced genre matrix: ${this.enhancedGenreMatrix.size} genres`);
    console.log(`   Genre audio profiles: ${Object.keys(this.genreAudioProfiles).length} profiles`);
    console.log(`   Artist audio profiles: ${this.artistAudioProfiles.size} profiles`);
  }

  // NEW: Initialize enhanced genre matrix for similarity calculations
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

  // NEW: Initialize genre audio profiles for sound characteristics
  initializeGenreAudioProfiles() {
    return {
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

      // Bass family
      'dubstep': { energy: 0.95, danceability: 0.85, valence: 0.40, tempo: 140, acousticness: 0.01, instrumentalness: 0.70 },
      'drum and bass': { energy: 0.90, danceability: 0.80, valence: 0.45, tempo: 175, acousticness: 0.02, instrumentalness: 0.75 },
      'dnb': { energy: 0.90, danceability: 0.80, valence: 0.45, tempo: 175, acousticness: 0.02, instrumentalness: 0.75 },
      'trap': { energy: 0.85, danceability: 0.85, valence: 0.50, tempo: 140, acousticness: 0.03, instrumentalness: 0.60 },

      // Dance family
      'dance': { energy: 0.80, danceability: 0.90, valence: 0.70, tempo: 120, acousticness: 0.05, instrumentalness: 0.50 },
      'edm': { energy: 0.85, danceability: 0.90, valence: 0.70, tempo: 128, acousticness: 0.03, instrumentalness: 0.60 },
      'electro': { energy: 0.80, danceability: 0.85, valence: 0.60, tempo: 125, acousticness: 0.04, instrumentalness: 0.65 }
    };
  }

  // NEW: Initialize artist audio profiles for sound characteristics
  initializeArtistAudioProfiles() {
    const profiles = new Map();
    
    // EDM Artists with their sound characteristics
    profiles.set('deadmau5', { energy: 0.70, danceability: 0.75, valence: 0.55, tempo: 128, acousticness: 0.05, instrumentalness: 0.70, confidence: 0.9 });
    profiles.set('calvin harris', { energy: 0.85, danceability: 0.90, valence: 0.75, tempo: 128, acousticness: 0.02, instrumentalness: 0.40, confidence: 0.9 });
    profiles.set('tiësto', { energy: 0.80, danceability: 0.80, valence: 0.70, tempo: 138, acousticness: 0.03, instrumentalness: 0.60, confidence: 0.9 });
    profiles.set('david guetta', { energy: 0.85, danceability: 0.90, valence: 0.75, tempo: 128, acousticness: 0.02, instrumentalness: 0.35, confidence: 0.9 });
    profiles.set('martin garrix', { energy: 0.90, danceability: 0.90, valence: 0.80, tempo: 128, acousticness: 0.01, instrumentalness: 0.50, confidence: 0.9 });
    profiles.set('skrillex', { energy: 0.95, danceability: 0.85, valence: 0.45, tempo: 140, acousticness: 0.01, instrumentalness: 0.70, confidence: 0.9 });
    profiles.set('armin van buuren', { energy: 0.80, danceability: 0.75, valence: 0.70, tempo: 138, acousticness: 0.03, instrumentalness: 0.60, confidence: 0.9 });
    profiles.set('above & beyond', { energy: 0.75, danceability: 0.70, valence: 0.75, tempo: 132, acousticness: 0.04, instrumentalness: 0.65, confidence: 0.9 });
    profiles.set('porter robinson', { energy: 0.65, danceability: 0.70, valence: 0.60, tempo: 120, acousticness: 0.08, instrumentalness: 0.60, confidence: 0.8 });
    profiles.set('flume', { energy: 0.60, danceability: 0.75, valence: 0.55, tempo: 115, acousticness: 0.10, instrumentalness: 0.70, confidence: 0.8 });
    
    return profiles;
  }

  // PRESERVED: Only enhance events that need enhancement
  needsEnhancement(event) {
    const alreadyProcessed = event.enhancementProcessed === true;
    const hasOurScore = event.recommendationMetrics?.tasteScore !== undefined;
    return !alreadyProcessed && !hasOurScore;
  }

  // ENHANCED: Phase 1 enhancement processing with metadata extraction
  async enhanceEvent(event) {
    if (!this.enabled || !this.needsEnhancement(event)) {
      return { ...event, enhancementProcessed: false, enhancementSkipped: true };
    }

    try {
      // PRESERVED: Stage 1 - Artist extraction
      const artistEnhanced = this.extractArtists(event);

      // PRESERVED: Stage 2 - Genre detection
      const genreEnhanced = this.detectGenres(artistEnhanced);

      // PRESERVED: Stage 3 - Basic recommendation scoring (for backward compatibility)
      const scoreEnhanced = this.calculateEnhancedRecommendationScore(genreEnhanced);

      // NEW: Stage 4 - Sound characteristics extraction (Phase 1 Addition)
      const soundEnhanced = this.extractSoundCharacteristics(scoreEnhanced);

      // NEW: Stage 5 - Artist metadata extraction (Phase 1 Addition)
      const artistMetadataEnhanced = this.extractArtistMetadata(soundEnhanced);

      // NEW: Stage 6 - Enhanced genre data extraction (Phase 1 Addition)
      const enhancedGenreData = this.extractEnhancedGenreData(artistMetadataEnhanced);

      // PRESERVED: Data cleaning for MongoDB
      const cleanedEvent = this.cleanEventForDatabase(enhancedGenreData);

      return {
        ...cleanedEvent,
        enhancementProcessed: true,
        enhancementMetadata: {
          processedAt: new Date(),
          version: this.version,
          stages: [
            'artist_extraction', 
            'genre_detection', 
            'enhanced_recommendation_scoring',
            'sound_characteristics_extraction',
            'artist_metadata_extraction',
            'enhanced_genre_data_extraction',
            'data_cleaning'
          ]
        }
      };
    } catch (error) {
      console.warn(`Enhancement failed for ${event.name}:`, error.message);
      return { ...event, enhancementProcessed: false, enhancementError: error.message };
    }
  }

  // NEW: Extract sound characteristics for events (Phase 1 Addition)
  extractSoundCharacteristics(event) {
    try {
      const artists = event.artists || [];
      const genres = event.genres || [];
      
      let soundCharacteristics = {
        energy: 0.5,
        danceability: 0.5,
        valence: 0.5,
        tempo: 120,
        acousticness: 0.5,
        instrumentalness: 0.5,
        confidence: 0.3,
        source: 'genre_based_estimation',
        dataFreshness: 'static'
      };

      // Try to get sound characteristics from artists first (higher confidence)
      let artistBasedFeatures = null;
      let artistConfidence = 0;

      if (artists.length > 0) {
        const artistFeatures = [];
        
        artists.forEach(artist => {
          const artistName = (typeof artist === 'string' ? artist : artist.name || '').toLowerCase();
          const profile = this.artistAudioProfiles.get(artistName);
          
          if (profile) {
            artistFeatures.push(profile);
          }
        });

        if (artistFeatures.length > 0) {
          // Average the artist features
          artistBasedFeatures = this.averageAudioFeatures(artistFeatures);
          artistConfidence = artistFeatures.reduce((sum, f) => sum + (f.confidence || 0.8), 0) / artistFeatures.length;
          
          soundCharacteristics = {
            ...artistBasedFeatures,
            confidence: artistConfidence,
            source: 'artist_based',
            dataFreshness: 'static'
          };
        }
      }

      // If no artist-based features, fall back to genre-based features
      if (!artistBasedFeatures && genres.length > 0) {
        const genreFeatures = [];
        
        genres.forEach(genre => {
          const genreName = genre.toLowerCase();
          const profile = this.genreAudioProfiles[genreName];
          
          if (profile) {
            genreFeatures.push(profile);
          }
        });

        if (genreFeatures.length > 0) {
          const genreBasedFeatures = this.averageAudioFeatures(genreFeatures);
          
          soundCharacteristics = {
            ...genreBasedFeatures,
            confidence: 0.6, // Medium confidence for genre-based
            source: 'genre_based',
            dataFreshness: 'static'
          };
        }
      }

      return {
        ...event,
        soundCharacteristics
      };

    } catch (error) {
      console.warn(`Sound characteristics extraction failed for ${event.name}:`, error.message);
      return {
        ...event,
        soundCharacteristics: {
          energy: 0.5,
          danceability: 0.5,
          valence: 0.5,
          tempo: 120,
          acousticness: 0.5,
          instrumentalness: 0.5,
          confidence: 0.1,
          source: 'extraction_failed',
          dataFreshness: 'static',
          error: error.message
        }
      };
    }
  }

  // NEW: Extract artist metadata for events (Phase 1 Addition)
  extractArtistMetadata(event) {
    try {
      const artists = event.artists || [];
      const artistMetadata = {
        popularity: 50,
        genres: [],
        soundDNA: { energy: 0.5, valence: 0.5 },
        edmWeight: 0.5,
        confidence: 0.3,
        source: 'static_data'
      };

      if (artists.length === 0) {
        return { ...event, artistMetadata };
      }

      let totalPopularity = 0;
      let popularityCount = 0;
      const allGenres = new Set();
      let totalEnergy = 0;
      let totalValence = 0;
      let edmWeightSum = 0;
      let validArtists = 0;

      artists.forEach(artist => {
        const artistName = (typeof artist === 'string' ? artist : artist.name || '').toLowerCase();
        
        // Get popularity
        const popularity = this.artistPopularity.get(artistName);
        if (popularity !== undefined) {
          totalPopularity += popularity;
          popularityCount++;
        }

        // Get genres
        const artistGenreData = this.artistGenres.get(artistName);
        if (artistGenreData) {
          allGenres.add(artistGenreData.genre);
          edmWeightSum += artistGenreData.weight;
          validArtists++;
        }

        // Get sound DNA
        const audioProfile = this.artistAudioProfiles.get(artistName);
        if (audioProfile) {
          totalEnergy += audioProfile.energy;
          totalValence += audioProfile.valence;
        }
      });

      // Calculate averages
      if (popularityCount > 0) {
        artistMetadata.popularity = Math.round(totalPopularity / popularityCount);
      }

      if (validArtists > 0) {
        artistMetadata.edmWeight = edmWeightSum / validArtists;
        artistMetadata.soundDNA.energy = totalEnergy / validArtists;
        artistMetadata.soundDNA.valence = totalValence / validArtists;
        artistMetadata.confidence = 0.7; // Higher confidence with valid artist data
      }

      artistMetadata.genres = Array.from(allGenres);

      return {
        ...event,
        artistMetadata
      };

    } catch (error) {
      console.warn(`Artist metadata extraction failed for ${event.name}:`, error.message);
      return {
        ...event,
        artistMetadata: {
          popularity: 50,
          genres: [],
          soundDNA: { energy: 0.5, valence: 0.5 },
          edmWeight: 0.5,
          confidence: 0.1,
          source: 'extraction_failed',
          error: error.message
        }
      };
    }
  }

  // NEW: Extract enhanced genre data for events (Phase 1 Addition)
  extractEnhancedGenreData(event) {
    try {
      const genres = event.genres || [];
      const enhancedGenres = {
        primary: [...genres],
        expanded: [],
        similarity: {},
        edmClassification: 'unknown',
        confidence: 0.5
      };

      if (genres.length === 0) {
        return { ...event, enhancedGenres };
      }

      // Expand genres using similarity matrix
      const expandedSet = new Set(genres);
      const similarityMap = {};

      genres.forEach(genre => {
        const genreLower = genre.toLowerCase();
        
        // Check EDM classification
        if (this.edmGenreWeights.has(genreLower)) {
          const weight = this.edmGenreWeights.get(genreLower);
          if (weight >= 0.8) {
            enhancedGenres.edmClassification = 'core_edm';
          } else if (weight >= 0.5) {
            enhancedGenres.edmClassification = 'electronic_related';
          } else if (weight > 0) {
            enhancedGenres.edmClassification = 'edm_adjacent';
          }
        }

        // Find similar genres
        for (const [key, similarity] of this.enhancedGenreMatrix.entries()) {
          const [genre1, genre2] = key.split(':');
          
          if (genre1 === genreLower && similarity >= 0.5) {
            expandedSet.add(genre2);
            similarityMap[genre2] = similarity;
          }
        }
      });

      enhancedGenres.expanded = Array.from(expandedSet);
      enhancedGenres.similarity = similarityMap;
      enhancedGenres.confidence = genres.length > 0 ? 0.8 : 0.3;

      return {
        ...event,
        enhancedGenres
      };

    } catch (error) {
      console.warn(`Enhanced genre data extraction failed for ${event.name}:`, error.message);
      return {
        ...event,
        enhancedGenres: {
          primary: event.genres || [],
          expanded: [],
          similarity: {},
          edmClassification: 'extraction_failed',
          confidence: 0.1,
          error: error.message
        }
      };
    }
  }

  // NEW: Helper function to average audio features
  averageAudioFeatures(features) {
    if (features.length === 0) return null;

    const averaged = {
      energy: 0,
      danceability: 0,
      valence: 0,
      tempo: 0,
      acousticness: 0,
      instrumentalness: 0
    };

    features.forEach(feature => {
      Object.keys(averaged).forEach(key => {
        if (feature[key] !== undefined) {
          averaged[key] += feature[key];
        }
      });
    });

    Object.keys(averaged).forEach(key => {
      averaged[key] = averaged[key] / features.length;
    });

    return averaged;
  }

  // PRESERVED: Extract artists (exact copy from original)
  extractArtists(event) {
    const artists = [];

    if (event._embedded && event._embedded.attractions) {
      event._embedded.attractions.forEach(attraction => {
        if (attraction.name) {
          artists.push({
            name: attraction.name,
            id: attraction.id || '',
            url: attraction.url || '',
            image: attraction.images?.[0]?.url || '',
            genres: attraction.classifications ?
              attraction.classifications.map(c => c.genre?.name).filter(Boolean) : []
          });
        }
      });
    }

    return { ...event, artists };
  }

  // PRESERVED: Detect genres (exact copy from original)
  detectGenres(event) {
    const genres = new Set();

    // Extract from classifications
    if (event.classifications) {
      event.classifications.forEach(classification => {
        if (classification.genre && classification.genre.name) {
          genres.add(classification.genre.name.toLowerCase());
        }
        if (classification.subGenre && classification.subGenre.name) {
          genres.add(classification.subGenre.name.toLowerCase());
        }
      });
    }

    // Extract from artist classifications
    if (event.artists) {
      event.artists.forEach(artist => {
        if (artist.genres) {
          artist.genres.forEach(genre => {
            if (genre) genres.add(genre.toLowerCase());
          });
        }
      });
    }

    return { ...event, genres: Array.from(genres) };
  }

  // PRESERVED: Calculate enhanced recommendation score (exact copy from original)
  calculateEnhancedRecommendationScore(event) {
    const artists = event.artists || [];
    const genres = event.genres || [];
    const venue = event.venue || {};

    let genreScore = this.calculateGenreScore(genres);
    let artistScore = this.calculateArtistScore(artists);
    let venueScore = this.calculateVenueScore(venue);

    // Apply city trending bonus
    const city = venue.city?.name?.toLowerCase() || '';
    const trendingBonus = this.cityTrendingBonus.get(city) || 1.0;
    
    if (trendingBonus > 1.0) {
      genreScore *= trendingBonus;
      artistScore *= trendingBonus;
    }

    // Calculate weighted score
    const tasteScore = Math.round(
      (genreScore * 0.6) + (artistScore * 0.3) + (venueScore * 0.1)
    );

    return {
      ...event,
      recommendationMetrics: {
        tasteScore: Math.max(0, Math.min(100, tasteScore)),
        genreScore,
        artistScore,
        venueScore,
        trendingBonus,
        calculatedAt: new Date()
      }
    };
  }

  // PRESERVED: Calculate genre score (exact copy from original)
  calculateGenreScore(genres) {
    if (!genres || genres.length === 0) return 30;

    let totalWeight = 0;
    let weightCount = 0;

    genres.forEach(genre => {
      const weight = this.edmGenreWeights.get(genre.toLowerCase());
      if (weight !== undefined) {
        totalWeight += weight;
        weightCount++;
      }
    });

    if (weightCount === 0) return 30;

    const averageWeight = totalWeight / weightCount;
    return Math.round(averageWeight * 100);
  }

  // PRESERVED: Calculate artist score (exact copy from original)
  calculateArtistScore(artists) {
    if (!artists || artists.length === 0) return 30;

    let totalScore = 0;
    let artistCount = 0;

    artists.forEach(artist => {
      const artistName = (typeof artist === 'string' ? artist : artist.name || '').toLowerCase();
      const artistData = this.artistGenres.get(artistName);
      
      if (artistData) {
        totalScore += artistData.weight * 100;
        artistCount++;
      }
    });

    if (artistCount === 0) return 30;

    return Math.round(totalScore / artistCount);
  }

  // PRESERVED: Calculate venue score (exact copy from original)
  calculateVenueScore(venue) {
    return 50; // Default venue score
  }

  // PRESERVED: Clean event for database (exact copy from original with object structure preservation)
  cleanEventForDatabase(event) {
    const cleaned = { ...event };

    // Preserve artist objects structure for UnifiedEvent schema
    if (cleaned.artists) {
      if (Array.isArray(cleaned.artists)) {
        cleaned.artists = cleaned.artists.map(artist => {
          if (typeof artist === 'string') {
            return {
              name: artist,
              id: '',
              url: '',
              image: '',
              genres: []
            };
          } else if (typeof artist === 'object' && artist.name) {
            return {
              name: String(artist.name || ''),
              id: String(artist.id || ''),
              url: String(artist.url || ''),
              image: String(artist.image || ''),
              genres: Array.isArray(artist.genres) ? artist.genres.map(g => String(g)) : []
            };
          } else {
            return {
              name: String(artist),
              id: '',
              url: '',
              image: '',
              genres: []
            };
          }
        }).filter(artist => artist.name && artist.name.length > 0);
      } else {
        cleaned.artists = [{
          name: String(cleaned.artists),
          id: '',
          url: '',
          image: '',
          genres: []
        }];
      }
    } else {
      cleaned.artists = [];
    }

    // Ensure artistList is always an array of strings (for frontend)
    if (cleaned.artists && Array.isArray(cleaned.artists)) {
      cleaned.artistList = cleaned.artists.map(artist => artist.name).filter(name => name && name.length > 0);
    } else {
      cleaned.artistList = [];
    }

    // Ensure genres is always an array of strings
    if (cleaned.genres) {
      if (Array.isArray(cleaned.genres)) {
        cleaned.genres = cleaned.genres.map(g => String(g)).filter(g => g && g.length > 0);
      } else {
        cleaned.genres = [String(cleaned.genres)];
      }
    } else {
      cleaned.genres = [];
    }

    return cleaned;
  }
}

module.exports = { RecommendationEnhancer };

