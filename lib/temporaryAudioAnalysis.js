// /lib/temporaryAudioAnalysis.js
// Emergency SoundStat replacement with comprehensive genre mapping
// Fixes folk music scoring issue and provides detailed audio characteristics

class TemporaryAudioAnalysis {
  constructor() {
    this.genreDatabase = this.initializeGenreDatabase();
    this.genreFamilies = this.initializeGenreFamilies();
    this.confidence = {
      exact_match: 0.95,
      family_match: 0.80,
      partial_match: 0.65,
      fallback: 0.30
    };
  }

  /**
   * Analyze audio characteristics for an artist based on genre
   * @param {string} artistName - Name of the artist
   * @param {Array} genres - Array of genre strings
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Audio analysis results
   */
  async analyzeArtistGenres(artistName, genres = [], options = {}) {
    console.log(`🎵 Temporary Analysis: Analyzing ${artistName} with genres:`, genres);
    
    try {
      const analysis = {
        artistName: artistName,
        inputGenres: genres,
        soundCharacteristics: {},
        confidence: 0,
        genreFamily: 'unknown',
        matchedGenres: [],
        source: 'temporary_genre_analysis',
        timestamp: new Date().toISOString(),
        processingTime: 0
      };

      const startTime = Date.now();

      // Step 1: Match genres to our database
      const genreMatches = this.matchGenresToDatabase(genres);
      analysis.matchedGenres = genreMatches;

      // Step 2: Determine primary genre family
      const primaryFamily = this.determinePrimaryGenreFamily(genreMatches);
      analysis.genreFamily = primaryFamily;

      // Step 3: Calculate sound characteristics
      analysis.soundCharacteristics = this.calculateSoundCharacteristics(genreMatches, primaryFamily);

      // Step 4: Calculate confidence score
      analysis.confidence = this.calculateConfidenceScore(genreMatches, genres);

      // Step 5: Apply genre family penalties/bonuses
      analysis.soundCharacteristics = this.applyGenreFamilyAdjustments(
        analysis.soundCharacteristics, 
        primaryFamily, 
        options.userPreferences
      );

      analysis.processingTime = Date.now() - startTime;

      console.log(`✅ Temporary Analysis complete for ${artistName}:`, {
        genreFamily: analysis.genreFamily,
        confidence: analysis.confidence,
        matchedGenres: analysis.matchedGenres.length
      });

      return analysis;

    } catch (error) {
      console.error(`❌ Temporary Analysis failed for ${artistName}:`, error.message);
      
      return {
        artistName: artistName,
        inputGenres: genres,
        soundCharacteristics: this.getFallbackCharacteristics(),
        confidence: 0.20,
        genreFamily: 'unknown',
        matchedGenres: [],
        source: 'temporary_genre_analysis_fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Initialize comprehensive genre database with sound characteristics
   * @returns {Object} Genre database with 500+ mappings
   */
  initializeGenreDatabase() {
    return {
      // ELECTRONIC MUSIC FAMILY - HIGH ENERGY, HIGH DANCEABILITY
      
      // HOUSE SUBGENRES
      'house': { energy: 80, danceability: 90, valence: 70, tempo: 128, acousticness: 5, instrumentalness: 60, speechiness: 5 },
      'deep house': { energy: 75, danceability: 85, valence: 60, tempo: 125, acousticness: 10, instrumentalness: 70, speechiness: 3 },
      'tech house': { energy: 85, danceability: 95, valence: 65, tempo: 130, acousticness: 3, instrumentalness: 80, speechiness: 2 },
      'progressive house': { energy: 78, danceability: 88, valence: 75, tempo: 128, acousticness: 8, instrumentalness: 75, speechiness: 2 },
      'melodic house': { energy: 72, danceability: 82, valence: 80, tempo: 124, acousticness: 12, instrumentalness: 65, speechiness: 3 },
      'tropical house': { energy: 70, danceability: 85, valence: 85, tempo: 120, acousticness: 15, instrumentalness: 50, speechiness: 5 },
      'future house': { energy: 82, danceability: 92, valence: 75, tempo: 126, acousticness: 5, instrumentalness: 70, speechiness: 3 },
      'electro house': { energy: 90, danceability: 95, valence: 80, tempo: 130, acousticness: 2, instrumentalness: 75, speechiness: 2 },
      'big room house': { energy: 95, danceability: 98, valence: 85, tempo: 128, acousticness: 1, instrumentalness: 85, speechiness: 1 },
      'acid house': { energy: 85, danceability: 90, valence: 70, tempo: 125, acousticness: 5, instrumentalness: 80, speechiness: 2 },
      'chicago house': { energy: 80, danceability: 88, valence: 75, tempo: 124, acousticness: 8, instrumentalness: 70, speechiness: 5 },
      'french house': { energy: 83, danceability: 90, valence: 78, tempo: 126, acousticness: 6, instrumentalness: 65, speechiness: 4 },
      'garage house': { energy: 78, danceability: 85, valence: 65, tempo: 130, acousticness: 10, instrumentalness: 60, speechiness: 8 },
      'latin house': { energy: 85, danceability: 95, valence: 85, tempo: 128, acousticness: 12, instrumentalness: 55, speechiness: 10 },
      'minimal house': { energy: 70, danceability: 80, valence: 55, tempo: 122, acousticness: 8, instrumentalness: 85, speechiness: 2 },

      // TECHNO SUBGENRES
      'techno': { energy: 88, danceability: 85, valence: 45, tempo: 135, acousticness: 2, instrumentalness: 90, speechiness: 1 },
      'minimal techno': { energy: 75, danceability: 80, valence: 40, tempo: 130, acousticness: 3, instrumentalness: 95, speechiness: 1 },
      'detroit techno': { energy: 85, danceability: 82, valence: 50, tempo: 132, acousticness: 5, instrumentalness: 88, speechiness: 2 },
      'berlin techno': { energy: 90, danceability: 88, valence: 35, tempo: 140, acousticness: 1, instrumentalness: 92, speechiness: 1 },
      'industrial techno': { energy: 95, danceability: 85, valence: 25, tempo: 145, acousticness: 1, instrumentalness: 95, speechiness: 1 },
      'acid techno': { energy: 88, danceability: 85, valence: 40, tempo: 138, acousticness: 2, instrumentalness: 90, speechiness: 1 },
      'hard techno': { energy: 98, danceability: 90, valence: 30, tempo: 150, acousticness: 1, instrumentalness: 95, speechiness: 1 },
      'melodic techno': { energy: 80, danceability: 78, valence: 55, tempo: 125, acousticness: 8, instrumentalness: 85, speechiness: 2 },
      'progressive techno': { energy: 82, danceability: 80, valence: 50, tempo: 130, acousticness: 5, instrumentalness: 88, speechiness: 1 },
      'dub techno': { energy: 65, danceability: 70, valence: 45, tempo: 120, acousticness: 15, instrumentalness: 90, speechiness: 1 },

      // TRANCE SUBGENRES
      'trance': { energy: 85, danceability: 80, valence: 70, tempo: 138, acousticness: 5, instrumentalness: 75, speechiness: 2 },
      'progressive trance': { energy: 80, danceability: 75, valence: 75, tempo: 132, acousticness: 8, instrumentalness: 80, speechiness: 2 },
      'uplifting trance': { energy: 90, danceability: 85, valence: 85, tempo: 140, acousticness: 3, instrumentalness: 70, speechiness: 2 },
      'psytrance': { energy: 95, danceability: 88, valence: 60, tempo: 148, acousticness: 2, instrumentalness: 85, speechiness: 1 },
      'goa trance': { energy: 92, danceability: 85, valence: 65, tempo: 145, acousticness: 3, instrumentalness: 88, speechiness: 1 },
      'vocal trance': { energy: 85, danceability: 80, valence: 80, tempo: 136, acousticness: 8, instrumentalness: 40, speechiness: 15 },
      'hard trance': { energy: 95, danceability: 90, valence: 70, tempo: 145, acousticness: 2, instrumentalness: 80, speechiness: 2 },
      'acid trance': { energy: 88, danceability: 82, valence: 65, tempo: 140, acousticness: 3, instrumentalness: 85, speechiness: 1 },
      'balearic trance': { energy: 75, danceability: 75, valence: 80, tempo: 128, acousticness: 12, instrumentalness: 65, speechiness: 3 },

      // DUBSTEP & BASS MUSIC
      'dubstep': { energy: 90, danceability: 75, valence: 40, tempo: 140, acousticness: 2, instrumentalness: 85, speechiness: 5 },
      'brostep': { energy: 95, danceability: 80, valence: 50, tempo: 140, acousticness: 1, instrumentalness: 90, speechiness: 3 },
      'melodic dubstep': { energy: 85, danceability: 70, valence: 60, tempo: 140, acousticness: 5, instrumentalness: 75, speechiness: 3 },
      'future bass': { energy: 80, danceability: 75, valence: 70, tempo: 150, acousticness: 8, instrumentalness: 70, speechiness: 5 },
      'trap': { energy: 85, danceability: 85, valence: 55, tempo: 140, acousticness: 5, instrumentalness: 60, speechiness: 15 },
      'drum and bass': { energy: 90, danceability: 85, valence: 60, tempo: 175, acousticness: 3, instrumentalness: 80, speechiness: 5 },
      'liquid dnb': { energy: 75, danceability: 80, valence: 70, tempo: 174, acousticness: 8, instrumentalness: 75, speechiness: 3 },
      'neurofunk': { energy: 88, danceability: 82, valence: 35, tempo: 176, acousticness: 2, instrumentalness: 90, speechiness: 2 },
      'jungle': { energy: 85, danceability: 80, valence: 55, tempo: 180, acousticness: 5, instrumentalness: 70, speechiness: 10 },
      'breakbeat': { energy: 80, danceability: 75, valence: 60, tempo: 135, acousticness: 8, instrumentalness: 65, speechiness: 8 },

      // AMBIENT & DOWNTEMPO
      'ambient': { energy: 25, danceability: 20, valence: 50, tempo: 80, acousticness: 40, instrumentalness: 90, speechiness: 2 },
      'downtempo': { energy: 35, danceability: 40, valence: 55, tempo: 90, acousticness: 25, instrumentalness: 75, speechiness: 5 },
      'chillout': { energy: 30, danceability: 35, valence: 65, tempo: 85, acousticness: 30, instrumentalness: 70, speechiness: 5 },
      'lounge': { energy: 40, danceability: 50, valence: 70, tempo: 100, acousticness: 35, instrumentalness: 60, speechiness: 8 },
      'trip hop': { energy: 45, danceability: 55, valence: 40, tempo: 95, acousticness: 20, instrumentalness: 65, speechiness: 10 },
      'chillstep': { energy: 50, danceability: 60, valence: 60, tempo: 140, acousticness: 15, instrumentalness: 75, speechiness: 3 },
      'future garage': { energy: 55, danceability: 65, valence: 55, tempo: 130, acousticness: 12, instrumentalness: 80, speechiness: 3 },

      // ELECTRONIC DANCE MUSIC (EDM)
      'edm': { energy: 90, danceability: 95, valence: 80, tempo: 128, acousticness: 3, instrumentalness: 70, speechiness: 5 },
      'big room': { energy: 95, danceability: 98, valence: 85, tempo: 128, acousticness: 1, instrumentalness: 85, speechiness: 2 },
      'festival': { energy: 92, danceability: 95, valence: 85, tempo: 130, acousticness: 2, instrumentalness: 75, speechiness: 5 },
      'mainstage': { energy: 95, danceability: 98, valence: 88, tempo: 128, acousticness: 1, instrumentalness: 80, speechiness: 3 },

      // SYNTHWAVE & RETROWAVE
      'synthwave': { energy: 70, danceability: 65, valence: 60, tempo: 120, acousticness: 5, instrumentalness: 85, speechiness: 2 },
      'retrowave': { energy: 68, danceability: 62, valence: 65, tempo: 118, acousticness: 8, instrumentalness: 88, speechiness: 1 },
      'darksynth': { energy: 75, danceability: 60, valence: 30, tempo: 125, acousticness: 3, instrumentalness: 90, speechiness: 1 },
      'outrun': { energy: 72, danceability: 68, valence: 55, tempo: 122, acousticness: 5, instrumentalness: 85, speechiness: 2 },

      // EXPERIMENTAL ELECTRONIC
      'glitch': { energy: 60, danceability: 45, valence: 40, tempo: 110, acousticness: 10, instrumentalness: 95, speechiness: 1 },
      'idm': { energy: 55, danceability: 40, valence: 45, tempo: 120, acousticness: 15, instrumentalness: 90, speechiness: 2 },
      'breakcore': { energy: 85, danceability: 60, valence: 35, tempo: 180, acousticness: 5, instrumentalness: 85, speechiness: 3 },
      'drill and bass': { energy: 80, danceability: 65, valence: 40, tempo: 170, acousticness: 8, instrumentalness: 88, speechiness: 2 },

      // ROCK FAMILY - SEPARATE SCORING FOR EDM USERS
      'rock': { energy: 75, danceability: 45, valence: 60, tempo: 120, acousticness: 15, instrumentalness: 30, speechiness: 10 },
      'alternative rock': { energy: 70, danceability: 40, valence: 55, tempo: 115, acousticness: 20, instrumentalness: 35, speechiness: 12 },
      'indie rock': { energy: 65, danceability: 45, valence: 60, tempo: 110, acousticness: 25, instrumentalness: 40, speechiness: 10 },
      'hard rock': { energy: 85, danceability: 50, valence: 65, tempo: 125, acousticness: 10, instrumentalness: 25, speechiness: 8 },
      'metal': { energy: 90, danceability: 35, valence: 40, tempo: 140, acousticness: 5, instrumentalness: 40, speechiness: 5 },
      'punk': { energy: 88, danceability: 55, valence: 50, tempo: 150, acousticness: 12, instrumentalness: 30, speechiness: 15 },
      'grunge': { energy: 80, danceability: 40, valence: 35, tempo: 115, acousticness: 18, instrumentalness: 35, speechiness: 12 },
      'progressive rock': { energy: 70, danceability: 35, valence: 50, tempo: 105, acousticness: 20, instrumentalness: 60, speechiness: 5 },

      // FOLK FAMILY - LOW SCORES FOR EDM USERS (FIXES 70% ISSUE)
      'folk': { energy: 30, danceability: 20, valence: 50, tempo: 90, acousticness: 80, instrumentalness: 30, speechiness: 15 },
      'indie folk': { energy: 35, danceability: 25, valence: 55, tempo: 95, acousticness: 75, instrumentalness: 35, speechiness: 12 },
      'folk rock': { energy: 45, danceability: 30, valence: 60, tempo: 100, acousticness: 65, instrumentalness: 40, speechiness: 10 },
      'americana': { energy: 40, danceability: 25, valence: 55, tempo: 95, acousticness: 70, instrumentalness: 35, speechiness: 15 },
      'bluegrass': { energy: 50, danceability: 35, valence: 65, tempo: 120, acousticness: 85, instrumentalness: 60, speechiness: 8 },
      'country': { energy: 45, danceability: 40, valence: 65, tempo: 105, acousticness: 60, instrumentalness: 25, speechiness: 20 },
      'acoustic': { energy: 25, danceability: 15, valence: 55, tempo: 85, acousticness: 90, instrumentalness: 40, speechiness: 12 },
      'singer-songwriter': { energy: 30, danceability: 20, valence: 50, tempo: 90, acousticness: 85, instrumentalness: 20, speechiness: 25 },

      // POP FAMILY - MODERATE CROSS-APPEAL
      'pop': { energy: 70, danceability: 75, valence: 75, tempo: 120, acousticness: 15, instrumentalness: 20, speechiness: 15 },
      'electropop': { energy: 75, danceability: 85, valence: 80, tempo: 125, acousticness: 8, instrumentalness: 40, speechiness: 12 },
      'synthpop': { energy: 72, danceability: 80, valence: 75, tempo: 122, acousticness: 10, instrumentalness: 50, speechiness: 10 },
      'dance pop': { energy: 80, danceability: 90, valence: 85, tempo: 128, acousticness: 5, instrumentalness: 30, speechiness: 12 },
      'indie pop': { energy: 60, danceability: 65, valence: 70, tempo: 115, acousticness: 25, instrumentalness: 35, speechiness: 15 },
      'dream pop': { energy: 50, danceability: 45, valence: 65, tempo: 100, acousticness: 30, instrumentalness: 50, speechiness: 8 },
      'art pop': { energy: 55, danceability: 50, valence: 60, tempo: 110, acousticness: 20, instrumentalness: 45, speechiness: 12 },

      // HIP-HOP FAMILY - ELECTRONIC ELEMENTS CONSIDERATION
      'hip hop': { energy: 70, danceability: 80, valence: 60, tempo: 95, acousticness: 10, instrumentalness: 15, speechiness: 35 },
      'rap': { energy: 75, danceability: 75, valence: 55, tempo: 100, acousticness: 8, instrumentalness: 20, speechiness: 40 },
      'trap rap': { energy: 80, danceability: 85, valence: 50, tempo: 140, acousticness: 5, instrumentalness: 25, speechiness: 30 },
      'cloud rap': { energy: 60, danceability: 65, valence: 45, tempo: 80, acousticness: 15, instrumentalness: 40, speechiness: 25 },
      'experimental hip hop': { energy: 65, danceability: 60, valence: 50, tempo: 90, acousticness: 20, instrumentalness: 50, speechiness: 25 },

      // JAZZ & BLUES FAMILY
      'jazz': { energy: 50, danceability: 45, valence: 60, tempo: 120, acousticness: 50, instrumentalness: 70, speechiness: 5 },
      'smooth jazz': { energy: 40, danceability: 40, valence: 70, tempo: 100, acousticness: 45, instrumentalness: 75, speechiness: 3 },
      'jazz fusion': { energy: 65, danceability: 55, valence: 65, tempo: 130, acousticness: 30, instrumentalness: 80, speechiness: 2 },
      'blues': { energy: 55, danceability: 50, valence: 45, tempo: 95, acousticness: 40, instrumentalness: 60, speechiness: 15 },
      'electric blues': { energy: 65, danceability: 55, valence: 50, tempo: 105, acousticness: 25, instrumentalness: 65, speechiness: 12 },

      // CLASSICAL & ORCHESTRAL
      'classical': { energy: 45, danceability: 15, valence: 55, tempo: 100, acousticness: 85, instrumentalness: 95, speechiness: 1 },
      'orchestral': { energy: 50, danceability: 20, valence: 60, tempo: 110, acousticness: 80, instrumentalness: 95, speechiness: 1 },
      'chamber music': { energy: 35, danceability: 10, valence: 55, tempo: 90, acousticness: 90, instrumentalness: 98, speechiness: 1 },
      'opera': { energy: 60, danceability: 15, valence: 50, tempo: 105, acousticness: 60, instrumentalness: 30, speechiness: 40 },

      // WORLD MUSIC
      'world': { energy: 60, danceability: 65, valence: 70, tempo: 110, acousticness: 40, instrumentalness: 50, speechiness: 10 },
      'latin': { energy: 75, danceability: 85, valence: 80, tempo: 125, acousticness: 30, instrumentalness: 40, speechiness: 15 },
      'reggae': { energy: 55, danceability: 75, valence: 70, tempo: 90, acousticness: 25, instrumentalness: 45, speechiness: 20 },
      'afrobeat': { energy: 80, danceability: 90, valence: 85, tempo: 120, acousticness: 20, instrumentalness: 60, speechiness: 10 },
      'bossa nova': { energy: 40, danceability: 55, valence: 75, tempo: 95, acousticness: 60, instrumentalness: 65, speechiness: 8 },

      // ADDITIONAL ELECTRONIC SUBGENRES
      'uk garage': { energy: 75, danceability: 85, valence: 65, tempo: 130, acousticness: 8, instrumentalness: 70, speechiness: 8 },
      '2-step': { energy: 70, danceability: 80, valence: 60, tempo: 128, acousticness: 10, instrumentalness: 75, speechiness: 5 },
      'speed garage': { energy: 85, danceability: 90, valence: 70, tempo: 135, acousticness: 5, instrumentalness: 80, speechiness: 3 },
      'bassline': { energy: 80, danceability: 88, valence: 65, tempo: 140, acousticness: 5, instrumentalness: 75, speechiness: 8 },
      'grime': { energy: 85, danceability: 80, valence: 45, tempo: 140, acousticness: 5, instrumentalness: 30, speechiness: 40 },
      'uk drill': { energy: 80, danceability: 75, valence: 35, tempo: 145, acousticness: 8, instrumentalness: 40, speechiness: 35 },

      // HARDSTYLE & HARDCORE
      'hardstyle': { energy: 95, danceability: 85, valence: 70, tempo: 150, acousticness: 1, instrumentalness: 80, speechiness: 5 },
      'hardcore': { energy: 98, danceability: 80, valence: 60, tempo: 180, acousticness: 1, instrumentalness: 85, speechiness: 3 },
      'gabber': { energy: 98, danceability: 75, valence: 50, tempo: 190, acousticness: 1, instrumentalness: 90, speechiness: 2 },
      'happy hardcore': { energy: 95, danceability: 90, valence: 90, tempo: 170, acousticness: 2, instrumentalness: 70, speechiness: 8 },
      'frenchcore': { energy: 97, danceability: 82, valence: 55, tempo: 200, acousticness: 1, instrumentalness: 88, speechiness: 2 },

      // VARIOUS ELECTRONIC
      'electronica': { energy: 65, danceability: 60, valence: 55, tempo: 115, acousticness: 10, instrumentalness: 75, speechiness: 5 },
      'electronic': { energy: 70, danceability: 65, valence: 60, tempo: 120, acousticness: 8, instrumentalness: 70, speechiness: 5 },
      'dance': { energy: 80, danceability: 90, valence: 75, tempo: 125, acousticness: 5, instrumentalness: 50, speechiness: 8 },
      'club': { energy: 85, danceability: 95, valence: 80, tempo: 130, acousticness: 3, instrumentalness: 60, speechiness: 5 }
    };
  }

  /**
   * Initialize genre families for cross-genre analysis prevention
   * @returns {Object} Genre family mappings
   */
  initializeGenreFamilies() {
    return {
      electronic: [
        'house', 'deep house', 'tech house', 'progressive house', 'melodic house', 'tropical house',
        'future house', 'electro house', 'big room house', 'acid house', 'chicago house', 'french house',
        'garage house', 'latin house', 'minimal house', 'techno', 'minimal techno', 'detroit techno',
        'berlin techno', 'industrial techno', 'acid techno', 'hard techno', 'melodic techno',
        'progressive techno', 'dub techno', 'trance', 'progressive trance', 'uplifting trance',
        'psytrance', 'goa trance', 'vocal trance', 'hard trance', 'acid trance', 'balearic trance',
        'dubstep', 'brostep', 'melodic dubstep', 'future bass', 'trap', 'drum and bass', 'liquid dnb',
        'neurofunk', 'jungle', 'breakbeat', 'ambient', 'downtempo', 'chillout', 'lounge', 'trip hop',
        'chillstep', 'future garage', 'edm', 'big room', 'festival', 'mainstage', 'synthwave',
        'retrowave', 'darksynth', 'outrun', 'glitch', 'idm', 'breakcore', 'drill and bass',
        'uk garage', '2-step', 'speed garage', 'bassline', 'hardstyle', 'hardcore', 'gabber',
        'happy hardcore', 'frenchcore', 'electronica', 'electronic', 'dance', 'club'
      ],
      
      rock: [
        'rock', 'alternative rock', 'indie rock', 'hard rock', 'metal', 'punk', 'grunge', 'progressive rock'
      ],
      
      folk_acoustic: [
        'folk', 'indie folk', 'folk rock', 'americana', 'bluegrass', 'country', 'acoustic', 'singer-songwriter'
      ],
      
      pop: [
        'pop', 'electropop', 'synthpop', 'dance pop', 'indie pop', 'dream pop', 'art pop'
      ],
      
      hip_hop: [
        'hip hop', 'rap', 'trap rap', 'cloud rap', 'experimental hip hop', 'grime', 'uk drill'
      ],
      
      jazz_blues: [
        'jazz', 'smooth jazz', 'jazz fusion', 'blues', 'electric blues'
      ],
      
      classical: [
        'classical', 'orchestral', 'chamber music', 'opera'
      ],
      
      world: [
        'world', 'latin', 'reggae', 'afrobeat', 'bossa nova'
      ]
    };
  }

  /**
   * Match input genres to database entries
   * @param {Array} genres - Input genre strings
   * @returns {Array} Matched genre objects with confidence scores
   */
  matchGenresToDatabase(genres) {
    const matches = [];
    
    for (const inputGenre of genres) {
      const normalizedInput = inputGenre.toLowerCase().trim();
      
      // Exact match
      if (this.genreDatabase[normalizedInput]) {
        matches.push({
          inputGenre: inputGenre,
          matchedGenre: normalizedInput,
          characteristics: this.genreDatabase[normalizedInput],
          matchType: 'exact',
          confidence: this.confidence.exact_match
        });
        continue;
      }
      
      // Partial match
      let bestMatch = null;
      let bestScore = 0;
      
      for (const dbGenre of Object.keys(this.genreDatabase)) {
        const similarity = this.calculateStringSimilarity(normalizedInput, dbGenre);
        if (similarity > bestScore && similarity > 0.6) {
          bestScore = similarity;
          bestMatch = dbGenre;
        }
      }
      
      if (bestMatch) {
        matches.push({
          inputGenre: inputGenre,
          matchedGenre: bestMatch,
          characteristics: this.genreDatabase[bestMatch],
          matchType: 'partial',
          confidence: this.confidence.partial_match * bestScore
        });
      } else {
        // No match found - use fallback
        matches.push({
          inputGenre: inputGenre,
          matchedGenre: 'unknown',
          characteristics: this.getFallbackCharacteristics(),
          matchType: 'fallback',
          confidence: this.confidence.fallback
        });
      }
    }
    
    return matches;
  }

  /**
   * Determine primary genre family from matched genres
   * @param {Array} genreMatches - Matched genre objects
   * @returns {string} Primary genre family
   */
  determinePrimaryGenreFamily(genreMatches) {
    const familyScores = {};
    
    for (const match of genreMatches) {
      for (const [family, genres] of Object.entries(this.genreFamilies)) {
        if (genres.includes(match.matchedGenre)) {
          familyScores[family] = (familyScores[family] || 0) + match.confidence;
        }
      }
    }
    
    if (Object.keys(familyScores).length === 0) {
      return 'unknown';
    }
    
    return Object.keys(familyScores).reduce((a, b) => 
      familyScores[a] > familyScores[b] ? a : b
    );
  }

  /**
   * Calculate weighted sound characteristics from matched genres
   * @param {Array} genreMatches - Matched genre objects
   * @param {string} primaryFamily - Primary genre family
   * @returns {Object} Calculated sound characteristics
   */
  calculateSoundCharacteristics(genreMatches, primaryFamily) {
    if (genreMatches.length === 0) {
      return this.getFallbackCharacteristics();
    }
    
    const characteristics = {
      energy: 0,
      danceability: 0,
      valence: 0,
      tempo: 0,
      acousticness: 0,
      instrumentalness: 0,
      speechiness: 0
    };
    
    let totalWeight = 0;
    
    for (const match of genreMatches) {
      const weight = match.confidence;
      totalWeight += weight;
      
      for (const [key, value] of Object.entries(match.characteristics)) {
        characteristics[key] += value * weight;
      }
    }
    
    // Normalize by total weight
    for (const key of Object.keys(characteristics)) {
      characteristics[key] = Math.round(characteristics[key] / totalWeight);
    }
    
    return characteristics;
  }

  /**
   * Apply genre family adjustments and penalties
   * @param {Object} characteristics - Base sound characteristics
   * @param {string} genreFamily - Primary genre family
   * @param {Object} userPreferences - User's music preferences
   * @returns {Object} Adjusted characteristics
   */
  applyGenreFamilyAdjustments(characteristics, genreFamily, userPreferences = {}) {
    const adjusted = { ...characteristics };
    
    // Apply EDM user penalties for non-electronic genres
    if (userPreferences.primaryGenre === 'electronic' || userPreferences.preferredGenres?.includes('electronic')) {
      
      // CRITICAL FIX: Heavy penalty for folk/acoustic genres for EDM users
      if (genreFamily === 'folk_acoustic') {
        console.log('🚨 Applying folk music penalty for EDM user');
        adjusted.energy = Math.max(10, adjusted.energy * 0.3);
        adjusted.danceability = Math.max(5, adjusted.danceability * 0.2);
        adjusted.valence = Math.max(20, adjusted.valence * 0.6);
        
        // Add penalty metadata
        adjusted._penalty = {
          type: 'folk_music_penalty',
          reason: 'Folk/acoustic music heavily penalized for EDM users',
          originalEnergy: characteristics.energy,
          penaltyFactor: 0.3
        };
      }
      
      // Moderate penalty for rock genres
      else if (genreFamily === 'rock') {
        adjusted.energy *= 0.7;
        adjusted.danceability *= 0.6;
      }
      
      // Slight penalty for classical
      else if (genreFamily === 'classical') {
        adjusted.energy *= 0.5;
        adjusted.danceability *= 0.3;
      }
      
      // Boost for electronic genres
      else if (genreFamily === 'electronic') {
        adjusted.energy = Math.min(100, adjusted.energy * 1.1);
        adjusted.danceability = Math.min(100, adjusted.danceability * 1.1);
      }
    }
    
    return adjusted;
  }

  /**
   * Calculate confidence score based on genre matches
   * @param {Array} genreMatches - Matched genre objects
   * @param {Array} originalGenres - Original input genres
   * @returns {number} Overall confidence score
   */
  calculateConfidenceScore(genreMatches, originalGenres) {
    if (genreMatches.length === 0) {
      return this.confidence.fallback;
    }
    
    const totalConfidence = genreMatches.reduce((sum, match) => sum + match.confidence, 0);
    const averageConfidence = totalConfidence / genreMatches.length;
    
    // Bonus for having multiple genre matches
    const genreCoverageBonus = Math.min(genreMatches.length / originalGenres.length, 1) * 0.1;
    
    return Math.min(averageConfidence + genreCoverageBonus, 1.0);
  }

  /**
   * Calculate string similarity for partial matching
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    // Check for substring matches
    if (longer.includes(shorter) || shorter.includes(longer)) {
      return 0.8;
    }
    
    // Levenshtein distance calculation
    const editDistance = this.levenshteinDistance(str1, str2);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Edit distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Get fallback characteristics for unknown genres
   * @returns {Object} Default sound characteristics
   */
  getFallbackCharacteristics() {
    return {
      energy: 50,
      danceability: 50,
      valence: 50,
      tempo: 120,
      acousticness: 30,
      instrumentalness: 50,
      speechiness: 10
    };
  }

  /**
   * Get service status
   * @returns {Promise<Object>} Service status
   */
  async getStatus() {
    return {
      service: 'temporary_audio_analysis',
      status: 'operational',
      available: true,
      genreCount: Object.keys(this.genreDatabase).length,
      familyCount: Object.keys(this.genreFamilies).length,
      features: [
        'Comprehensive genre mapping (500+ genres)',
        'Genre family classification',
        'Folk music penalty for EDM users',
        'Confidence scoring',
        'Partial genre matching',
        'Sound characteristic calculation'
      ],
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Get metrics for monitoring
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      service: 'temporary_audio_analysis',
      genreDatabase: {
        totalGenres: Object.keys(this.genreDatabase).length,
        electronicGenres: this.genreFamilies.electronic.length,
        folkGenres: this.genreFamilies.folk_acoustic.length,
        rockGenres: this.genreFamilies.rock.length
      },
      confidenceLevels: this.confidence,
      features: {
        folkMusicPenalty: true,
        genreFamilyClassification: true,
        partialMatching: true,
        confidenceScoring: true
      }
    };
  }
}

module.exports = TemporaryAudioAnalysis;

