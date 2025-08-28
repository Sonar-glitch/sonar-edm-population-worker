/**
 * FINAL VERSION - eventValidation.js
 * 
 * Enhanced with Phase 1 Metadata Preservation in Deduplication:
 * - Preserves soundCharacteristics during duplicate merging
 * - Preserves artistMetadata during duplicate merging  
 * - Preserves enhancedGenres during duplicate merging
 * - Preserves enhancementProcessed flag during duplicate merging
 * 
 * Key Features:
 * ✅ Phase 1 metadata merging from both duplicate events
 * ✅ Quality-based event selection with metadata preservation
 * ✅ Comprehensive logging for debugging and verification
 * ✅ Tested and verified to preserve all Phase 1 metadata
 * 
 * Last Updated: 2025-07-18
 * Status: Production Ready
 */

const mongoose = require('mongoose');

/**
 * Validate and normalize event data from various sources
 */
function validateAndNormalizeEvent(event, sourceName) {
  if (!event) return null;

  try {
    // Basic validation
    if (!event.name || typeof event.name !== 'string') {
      console.warn(`⚠️ Event missing valid name from ${sourceName}:`, event.id || 'unknown');
      return null;
    }

    // Normalize the event structure
    const normalized = {
      // Core fields
      name: String(event.name).trim(),
      date: event.date ? new Date(event.date) : null,
      startTime: event.startTime ? new Date(event.startTime) : null,
      endTime: event.endTime ? new Date(event.endTime) : null,
      
      // Source tracking
      source: sourceName,
      sourceId: String(event._id || event.id || event.sourceId || ''),
      
      // Venue information
      venue: {
        name: event.venue?.name || event.venueName || 'Venue TBA',
        address: event.venue?.address || event.address || '',
        city: event.venue?.city || event.city || '',
        state: event.venue?.state || event.state || '',
        country: event.venue?.country || event.country || '',
        postalCode: event.venue?.postalCode || event.postalCode || ''
      },
      
      // Location data (normalize to GeoJSON Point when possible)
      location: (function(){
        const coords = event.location?.coordinates || event.coordinates || null;
        const timezone = event.location?.timezone || event.timezone || null;
        if (coords && Array.isArray(coords) && coords.length === 2) {
          const lon = Number(coords[0]);
          const lat = Number(coords[1]);
          if (Number.isFinite(lon) && Number.isFinite(lat)) {
            return { type: 'Point', coordinates: [lon, lat], timezone };
          }
        }
        return null;
      })(),
      
      // Event details
      description: event.description || '',
      images: Array.isArray(event.images) ? event.images : [],
      url: event.url || '',
      
      // Pricing
      priceRange: {
        min: parseFloat(event.priceRange?.min || event.minPrice || 0) || 0,
        max: parseFloat(event.priceRange?.max || event.maxPrice || 0) || 0,
        currency: event.priceRange?.currency || event.currency || 'USD'
      },
      
      // Categories and genres
      genres: Array.isArray(event.genres) ? event.genres : [],
      categories: Array.isArray(event.categories) ? event.categories : [],
      
      // Artists/performers
      artists: Array.isArray(event.artists) ? event.artists : [],
      
      // Metadata
      createdAt: event.createdAt ? new Date(event.createdAt) : new Date(),
      updatedAt: event.updatedAt ? new Date(event.updatedAt) : new Date(),
      
      // Preserve any existing enhancement data
      soundCharacteristics: event.soundCharacteristics || null,
      artistMetadata: event.artistMetadata || null,
      enhancedGenres: event.enhancedGenres || null,
      enhancementProcessed: event.enhancementProcessed || false
    };

    return normalized;

  } catch (error) {
    console.warn(`⚠️ Validation failed for event from ${sourceName}:`, error.message);
    return null;
  }
}

/**
 * ENHANCED DEDUPLICATION v3 - OPTIMIZED SEMANTIC DEDUPLICATION
 * WITH PHASE 1 METADATA PRESERVATION AND VALIDATED LOGIC
 * 
 * Incorporates the validated semantic deduplication logic from our optimization:
 * - Groups by name + date + venue (case-insensitive)
 * - Prioritizes events with more artists
 * - Falls back to most recent timestamp
 * - Preserves all Phase 1 metadata during merging
 */
function mergeAndDeduplicateEvents(events) {
  console.log(`🔄 Starting enhanced semantic deduplication for ${events.length} events...`);
  
  const eventMap = new Map();
  let duplicatesRemoved = 0;

  for (const event of events) {
    if (!event || !event.name || !event.date) {
      console.warn('⚠️ Skipping invalid event:', event?.name || 'unnamed');
      continue;
    }

    // Create semantic deduplication key (validated logic from optimization)
    const normalizedName = event.name.toLowerCase().trim().replace(/[^\w\s]/g, '');
    const dateOnly = new Date(event.date).toISOString().split('T')[0];
    const normalizedVenue = (event.venue?.name || event.venueName || '').toLowerCase().trim();
    const semanticKey = `${normalizedName}|${dateOnly}|${normalizedVenue}`;

    const existingEvent = eventMap.get(semanticKey);

    if (!existingEvent) {
      // First event with this semantic signature
      eventMap.set(semanticKey, event);
    } else {
      // Duplicate found - apply validated selection logic
      duplicatesRemoved++;
      
      let keepNewEvent = false;
      
      // Priority 1: Event with more artists (more complete data)
      const existingArtistCount = (existingEvent.artists || existingEvent.artistList || []).length;
      const currentArtistCount = (event.artists || event.artistList || []).length;
      
      if (currentArtistCount > existingArtistCount) {
        keepNewEvent = true;
        console.log(`  🎭 Keeping newer event (more artists): ${currentArtistCount} vs ${existingArtistCount}`);
      } else if (currentArtistCount === existingArtistCount) {
        // Priority 2: Most recent event (by updatedAt/createdAt)
        const existingTimestamp = new Date(existingEvent.updatedAt || existingEvent.createdAt || 0);
        const currentTimestamp = new Date(event.updatedAt || event.createdAt || 0);
        
        if (currentTimestamp > existingTimestamp) {
          keepNewEvent = true;
          console.log(`  📅 Keeping newer event (more recent): ${currentTimestamp.toISOString()}`);
        } else if (currentTimestamp.getTime() === existingTimestamp.getTime()) {
          // Priority 3: Completeness score as tiebreaker
          const existingQuality = calculateCompletenessScore(existingEvent);
          const currentQuality = calculateCompletenessScore(event);
          
          if (currentQuality > existingQuality) {
            keepNewEvent = true;
            console.log(`  ⭐ Keeping newer event (higher quality): ${currentQuality} vs ${existingQuality}`);
          }
        }
      }

      // Merge metadata and artist information
      const mergedEvent = keepNewEvent ? 
        mergeEventMetadata(event, existingEvent) : 
        mergeEventMetadata(existingEvent, event);
      
      eventMap.set(semanticKey, mergedEvent);
    }
  }

  const deduplicated = Array.from(eventMap.values());
  const removalPercentage = ((duplicatesRemoved / events.length) * 100).toFixed(1);
  
  console.log(`📊 Enhanced semantic deduplication complete:`);
  console.log(`   Input: ${events.length} events`);
  console.log(`   Output: ${deduplicated.length} events`);
  console.log(`   Removed: ${duplicatesRemoved} duplicates (${removalPercentage}%)`);
  
  return deduplicated;
}

/**
 * Merge metadata and artist information from two events
 * Prioritizes the primary event but preserves valuable data from the secondary
 */
function mergeEventMetadata(primaryEvent, secondaryEvent) {
  // Merge artist lists (combining and deduplicating)
  const primaryArtists = primaryEvent.artists || primaryEvent.artistList || [];
  const secondaryArtists = secondaryEvent.artists || secondaryEvent.artistList || [];
  
  const allArtistNames = new Set();
  const mergedArtists = [];
  
  // Add primary artists first
  primaryArtists.forEach(artist => {
    const name = typeof artist === 'string' ? artist : (artist.name || artist.originalName);
    if (name && !allArtistNames.has(name.toLowerCase())) {
      allArtistNames.add(name.toLowerCase());
      mergedArtists.push(artist);
    }
  });
  
  // Add unique secondary artists
  secondaryArtists.forEach(artist => {
    const name = typeof artist === 'string' ? artist : (artist.name || artist.originalName);
    if (name && !allArtistNames.has(name.toLowerCase())) {
      allArtistNames.add(name.toLowerCase());
      mergedArtists.push(artist);
    }
  });

  return {
    ...primaryEvent, // Start with primary event
    
    // Merge artist information
    artists: mergedArtists.length > 0 ? mergedArtists : primaryEvent.artists,
    artistList: mergedArtists.length > 0 ? mergedArtists.map(a => 
      typeof a === 'string' ? a : (a.name || a.originalName)
    ).filter(Boolean) : primaryEvent.artistList,
    
    // Preserve Phase 1 metadata (enhanced)
    soundCharacteristics: primaryEvent.soundCharacteristics || secondaryEvent.soundCharacteristics,
    artistMetadata: primaryEvent.artistMetadata || secondaryEvent.artistMetadata,
    enhancedGenres: primaryEvent.enhancedGenres || secondaryEvent.enhancedGenres,
    enhancementProcessed: primaryEvent.enhancementProcessed || secondaryEvent.enhancementProcessed,
    
    // Merge genres and categories
    genres: [
      ...(primaryEvent.genres || []),
      ...(secondaryEvent.genres || [])
    ].filter((genre, index, arr) => 
      arr.findIndex(g => g.toLowerCase() === genre.toLowerCase()) === index
    ),
    
    categories: [
      ...(primaryEvent.categories || []),
      ...(secondaryEvent.categories || [])
    ].filter((cat, index, arr) => 
      arr.findIndex(c => c.toLowerCase() === cat.toLowerCase()) === index
    ),
    
    // Preserve better venue information
    venue: {
      name: primaryEvent.venue?.name || secondaryEvent.venue?.name || primaryEvent.venueName || secondaryEvent.venueName,
      address: primaryEvent.venue?.address || secondaryEvent.venue?.address,
      city: primaryEvent.venue?.city || secondaryEvent.venue?.city,
      state: primaryEvent.venue?.state || secondaryEvent.venue?.state,
      country: primaryEvent.venue?.country || secondaryEvent.venue?.country,
      postalCode: primaryEvent.venue?.postalCode || secondaryEvent.venue?.postalCode
    },
    
    // Use most recent timestamp
    updatedAt: new Date() // Mark as updated during merge
  };
}

/**
 * Calculate a completeness score for an event (0-100)
 * Enhanced to consider artist information and metadata
 */
function calculateCompletenessScore(event) {
  if (!event) return 0;
  
  let score = 0;
  
  // Core fields (10 points each)
  if (event.name && event.name !== 'Unnamed Event') score += 10;
  if (event.date) score += 10;
  if (event.venue && event.venue.name && event.venue.name !== 'Venue TBA') score += 10;
  if (event.location && event.location.coordinates) score += 10;
  if (event.description) score += 10;
  if (event.images && event.images.length > 0) score += 10;
  if (event.priceRange && (event.priceRange.min > 0 || event.priceRange.max > 0)) score += 10;
  if (event.genres && event.genres.length > 0) score += 10;
  
  // Artist information (enhanced scoring)
  const artistCount = (event.artists || event.artistList || []).length;
  if (artistCount > 0) {
    score += Math.min(artistCount * 2, 10); // Up to 10 points for artists (2 points per artist)
  }
  
  // Venue details
  if (event.venue && event.venue.address) score += 10;
  
  return Math.min(score, 100);
}

/**
 * Remove old events that are no longer relevant
 * This should be integrated into the worker to prevent database bloat
 */
async function cleanupOldEvents(UnifiedEvent) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Remove events older than 30 days
    
    const deleteResult = await UnifiedEvent.deleteMany({ 
      date: { $lt: cutoffDate } 
    });
    
    console.log(`🧹 Cleaned up ${deleteResult.deletedCount} old events`);
    return deleteResult.deletedCount;
  } catch (error) {
    console.error('❌ Error during old event cleanup:', error.message);
    return 0;
  }
}

/**
 * Validate that events_unified is being used as single source of truth
 * Prevent accidental writes to redundant collections
 */
function validateUnifiedArchitecture() {
  const allowedCollections = ['events_unified', 'events']; // events as supplementary only
  const deprecatedCollections = ['events_ticketmaster']; // Should not be written to
  
  return {
    isValidTarget: (collectionName) => allowedCollections.includes(collectionName),
    isDeprecated: (collectionName) => deprecatedCollections.includes(collectionName),
    getRecommendedCollection: () => 'events_unified'
  };
}

module.exports = {
  validateAndNormalizeEvent,
  mergeAndDeduplicateEvents,
  calculateCompletenessScore,
  cleanupOldEvents,
  validateUnifiedArchitecture
};

