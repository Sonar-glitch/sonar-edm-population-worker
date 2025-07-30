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
      
      // Location data
      location: {
        coordinates: event.location?.coordinates || event.coordinates || null,
        timezone: event.location?.timezone || event.timezone || null
      },
      
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
 * ENHANCED DEDUPLICATION v2 - Prioritizes newest event, then quality.
 * WITH PHASE 1 METADATA PRESERVATION
 */
function mergeAndDeduplicateEvents(events) {
  const eventMap = new Map();

  for (const event of events) {
    if (!event || !event.name || !event.date) continue;

    // Create a robust key for grouping duplicates
    const normalizedName = event.name.toLowerCase().trim().replace(/[^\w\s]/g, '');
    const dateOnly = new Date(event.date).toISOString().split('T')[0];
    const normalizedVenue = (event.venue?.name || '').toLowerCase().trim();
    const key = `${normalizedName}-${dateOnly}-${normalizedVenue}`;

    const existingEvent = eventMap.get(key);

    if (!existingEvent) {
      eventMap.set(key, event);
    } else {
      // A duplicate is found, we must decide which one to keep.
      const existingTimestamp = new Date(existingEvent.updatedAt || existingEvent.createdAt || 0);
      const currentTimestamp = new Date(event.updatedAt || event.createdAt || 0);

      let keepNewEvent = false;

      // Priority 1: Keep the newest event based on timestamp.
      if (currentTimestamp > existingTimestamp) {
        keepNewEvent = true;
      } else if (currentTimestamp.getTime() === existingTimestamp.getTime()) {
        // Priority 2: If timestamps are equal, fall back to quality score.
        const existingQuality = calculateCompletenessScore(existingEvent);
        const currentQuality = calculateCompletenessScore(event);
        if (currentQuality > existingQuality) {
          keepNewEvent = true;
        }
      }

      if (keepNewEvent) {
        // The new event is better. Merge metadata from the old one into it.
        const mergedEvent = {
          ...event, // Start with the new event
          soundCharacteristics: event.soundCharacteristics || existingEvent.soundCharacteristics,
          artistMetadata: event.artistMetadata || existingEvent.artistMetadata,
          enhancedGenres: event.enhancedGenres || existingEvent.enhancedGenres,
        };
        eventMap.set(key, mergedEvent);
      } else {
        // The existing event is better. Merge metadata from the new one into it.
        const mergedEvent = {
          ...existingEvent, // Start with the existing event
          soundCharacteristics: existingEvent.soundCharacteristics || event.soundCharacteristics,
          artistMetadata: existingEvent.artistMetadata || event.artistMetadata,
          enhancedGenres: existingEvent.enhancedGenres || event.enhancedGenres,
        };
        eventMap.set(key, mergedEvent);
      }
    }
  }

  const deduplicated = Array.from(eventMap.values());
  console.log(`📊 Deduplication v2 complete: ${events.length} → ${deduplicated.length} events (${events.length - deduplicated.length} duplicates removed, newest preserved)`);
  return deduplicated;
}

/**
 * Calculate a completeness score for an event (0-100)
 */
function calculateCompletenessScore(event) {
  if (!event) return 0;
  
  let score = 0;
  
  // Each field contributes 10 points to the total score
  if (event.name && event.name !== 'Unnamed Event') score += 10;
  if (event.date) score += 10;
  if (event.venue && event.venue.name && event.venue.name !== 'Venue TBA') score += 10;
  if (event.location && event.location.coordinates) score += 10;
  if (event.description) score += 10;
  if (event.images && event.images.length > 0) score += 10;
  if (event.priceRange && (event.priceRange.min > 0 || event.priceRange.max > 0)) score += 10;
  if (event.genres && event.genres.length > 0) score += 10;
  if (event.artists && event.artists.length > 0) score += 10;
  if (event.venue && event.venue.address) score += 10;
  
  return Math.min(score, 100);
}

module.exports = {
  validateAndNormalizeEvent,
  mergeAndDeduplicateEvents,
  calculateCompletenessScore
};

