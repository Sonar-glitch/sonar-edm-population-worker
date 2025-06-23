// Event Data Validation and Consistency Functions
// Add these functions to the events API to ensure data consistency

/**
 * Validate and normalize event data to ensure consistency across sources
 * @param {Object} event - Raw event data
 * @param {string} source - Data source identifier
 * @returns {Object} - Validated and normalized event
 */
function validateAndNormalizeEvent(event, source) {
  // Ensure all required fields are present with fallbacks
  const normalizedEvent = {
    // Core identification
    id: event.id || `${source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    source: source || 'unknown',
    
    // Event details
    name: (event.name || 'Unnamed Event').trim(),
    date: event.date || new Date().toISOString().split('T')[0],
    time: event.time || null,
    formattedDate: event.formattedDate || formatDateFallback(event.date),
    formattedTime: event.formattedTime || formatTimeFallback(event.time),
    
    // Location
    venue: (event.venue || 'Venue TBA').trim(),
    address: (event.address || 'Address TBA').trim(),
    city: (event.city || 'City TBA').trim(),
    venueType: event.venueType || detectVenueTypeFallback(event.venue, event.name),
    
    // Artists and content
    headliners: normalizeArtistArray(event.headliners),
    detectedGenres: normalizeGenreArray(event.detectedGenres),
    
    // Engagement
    matchScore: normalizeMatchScore(event.matchScore),
    ticketUrl: normalizeUrl(event.ticketUrl),
    priceRange: normalizePriceRange(event.priceRange)
  };

  // Add source-specific metadata
  if (source === 'edmtrain' && event.edmtrainId) {
    normalizedEvent.edmtrainId = event.edmtrainId;
  }
  
  if (source === 'mongodb' && event.originalData) {
    normalizedEvent.mongoData = event.originalData;
  }

  return normalizedEvent;
}

/**
 * Normalize artist array
 * @param {Array|string} artists - Artist data
 * @returns {Array} - Normalized artist array
 */
function normalizeArtistArray(artists) {
  if (!artists) return [];
  
  if (typeof artists === 'string') {
    return [artists.trim()].filter(a => a.length > 0);
  }
  
  if (Array.isArray(artists)) {
    return artists
      .map(artist => typeof artist === 'string' ? artist.trim() : String(artist).trim())
      .filter(artist => artist.length > 0)
      .slice(0, 5); // Limit to 5 artists
  }
  
  return [];
}

/**
 * Normalize genre array
 * @param {Array|string} genres - Genre data
 * @returns {Array} - Normalized genre array
 */
function normalizeGenreArray(genres) {
  if (!genres) return [];
  
  if (typeof genres === 'string') {
    return [genres.toLowerCase().trim()].filter(g => g.length > 0);
  }
  
  if (Array.isArray(genres)) {
    return genres
      .map(genre => typeof genre === 'string' ? genre.toLowerCase().trim() : String(genre).toLowerCase().trim())
      .filter(genre => genre.length > 0)
      .slice(0, 3); // Limit to 3 genres
  }
  
  return [];
}

/**
 * Normalize match score
 * @param {number|string} score - Match score
 * @returns {number} - Normalized score (0-99)
 */
function normalizeMatchScore(score) {
  if (typeof score === 'number' && score >= 0 && score <= 99) {
    return Math.round(score);
  }
  
  if (typeof score === 'string') {
    const parsed = parseFloat(score);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99) {
      return Math.round(parsed);
    }
  }
  
  // Default score based on data completeness
  return 50;
}

/**
 * Normalize URL
 * @param {string} url - URL string
 * @returns {string} - Normalized URL
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  
  if (trimmed.length > 0 && !trimmed.startsWith('#')) {
    return `https://${trimmed}`;
  }
  
  return '#';
}

/**
 * Normalize price range
 * @param {string|number} price - Price data
 * @returns {string} - Normalized price string
 */
function normalizePriceRange(price) {
  if (!price) return 'Price TBA';
  
  if (typeof price === 'number') {
    return `$${price}`;
  }
  
  if (typeof price === 'string') {
    const trimmed = price.trim();
    
    // Already formatted
    if (trimmed.startsWith('$') || trimmed.toLowerCase().includes('tba') || trimmed.toLowerCase().includes('free')) {
      return trimmed;
    }
    
    // Extract numbers
    const numbers = trimmed.match(/\d+(?:\.\d+)?/g);
    if (numbers && numbers.length > 0) {
      if (numbers.length === 1) {
        return `$${numbers[0]}`;
      } else {
        return `$${numbers[0]}-${numbers[numbers.length - 1]}`;
      }
    }
  }
  
  return 'Price TBA';
}

/**
 * Format date fallback
 * @param {string|Date} date - Date value
 * @returns {string} - Formatted date
 */
function formatDateFallback(date) {
  if (!date) return 'Date TBA';
  
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return 'Date TBA';
    
    return dateObj.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (error) {
    return 'Date TBA';
  }
}

/**
 * Format time fallback
 * @param {string} time - Time value
 * @returns {string} - Formatted time
 */
function formatTimeFallback(time) {
  if (!time) return 'Time TBA';
  
  try {
    if (time.includes(':')) {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      
      return `${hour12}:${minutes} ${ampm}`;
    }
    
    return time;
  } catch (error) {
    return 'Time TBA';
  }
}

/**
 * Detect venue type fallback
 * @param {string} venueName - Venue name
 * @param {string} eventName - Event name
 * @returns {string} - Venue type
 */
function detectVenueTypeFallback(venueName, eventName) {
  const venue = (venueName || '').toLowerCase();
  const event = (eventName || '').toLowerCase();
  
  if (venue.includes('club') || venue.includes('lounge') || venue.includes('bar')) {
    return 'Club';
  }
  
  if (venue.includes('hall') || venue.includes('theatre') || venue.includes('theater')) {
    return 'Concert Hall';
  }
  
  if (venue.includes('arena') || venue.includes('stadium') || venue.includes('centre') || venue.includes('center')) {
    return 'Arena';
  }
  
  if (venue.includes('festival') || event.includes('festival') || event.includes('fest')) {
    return 'Festival';
  }
  
  return 'Venue';
}

/**
 * Calculate data completeness score
 * @param {Object} event - Event object
 * @returns {number} - Completeness score (0-100)
 */
function calculateDataCompleteness(event) {
  const requiredFields = [
    'id', 'name', 'date', 'venue', 'city', 'source'
  ];
  
  const optionalFields = [
    'time', 'address', 'ticketUrl', 'priceRange', 'headliners', 'detectedGenres'
  ];
  
  let score = 0;
  
  // Required fields (60% of score)
  const requiredScore = requiredFields.reduce((acc, field) => {
    return acc + (event[field] && event[field] !== 'TBA' ? 10 : 0);
  }, 0);
  
  // Optional fields (40% of score)
  const optionalScore = optionalFields.reduce((acc, field) => {
    if (field === 'headliners' || field === 'detectedGenres') {
      return acc + (Array.isArray(event[field]) && event[field].length > 0 ? 6.67 : 0);
    }
    return acc + (event[field] && event[field] !== 'TBA' && event[field] !== '#' ? 6.67 : 0);
  }, 0);
  
  return Math.round(requiredScore + optionalScore);
}

/**
 * Merge and deduplicate events from multiple sources
 * @param {Array} mongoEvents - Events from MongoDB
 * @param {Array} edmTrainEvents - Events from EDMTrain
 * @returns {Object} - Merged events with metadata
 */
function mergeMultiSourceEvents(mongoEvents, edmTrainEvents) {
  // Normalize all events
  const normalizedMongo = mongoEvents.map(event => validateAndNormalizeEvent(event, 'mongodb'));
  const normalizedEdm = edmTrainEvents.map(event => validateAndNormalizeEvent(event, 'edmtrain'));
  
  // Deduplicate EDMTrain events against MongoDB events
  const uniqueEdmEvents = normalizedEdm.filter(edmEvent => {
    return !normalizedMongo.some(mongoEvent => {
      const nameMatch = calculateNameSimilarity(
        mongoEvent.name.toLowerCase(),
        edmEvent.name.toLowerCase()
      ) > 0.8;
      
      const dateMatch = mongoEvent.date === edmEvent.date;
      
      return nameMatch && dateMatch;
    });
  });
  
  // Combine events
  const allEvents = [...normalizedMongo, ...uniqueEdmEvents];
  
  // Calculate quality metrics
  const qualityMetrics = {
    totalEvents: allEvents.length,
    mongoEvents: normalizedMongo.length,
    edmTrainEvents: uniqueEdmEvents.length,
    duplicatesRemoved: normalizedEdm.length - uniqueEdmEvents.length,
    averageCompleteness: allEvents.reduce((acc, event) => 
      acc + calculateDataCompleteness(event), 0) / allEvents.length,
    sourceDistribution: {
      mongodb: normalizedMongo.length,
      edmtrain: uniqueEdmEvents.length
    }
  };
  
  return {
    events: allEvents,
    metadata: qualityMetrics
  };
}

/**
 * Calculate name similarity between two strings
 * @param {string} name1 - First name
 * @param {string} name2 - Second name
 * @returns {number} - Similarity score (0-1)
 */
function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  
  const words1 = name1.split(' ').filter(w => w.length > 2);
  const words2 = name2.split(' ').filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const commonWords = words1.filter(word => 
    words2.some(w2 => w2.includes(word) || word.includes(w2))
  );
  
  return commonWords.length / Math.max(words1.length, words2.length);
}

// Export functions for use in events API
module.exports = {
  validateAndNormalizeEvent,
  mergeMultiSourceEvents,
  calculateDataCompleteness,
  normalizeArtistArray,
  normalizeGenreArray,
  normalizePriceRange,
  calculateNameSimilarity
};

