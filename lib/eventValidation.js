//Create a completely clean eventValidation.js file

// Comprehensive Event Data Validation and Consistency Functions
// Handles all data structure inconsistencies across multiple sources

/**
 * Safe string extraction with fallback
 */
function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && value.toString) return value.toString().trim();
  return fallback;
}

/**
 * Safe array extraction with normalization
 */
function safeArray(value, maxItems = 10) {
  if (Array.isArray(value)) return value.slice(0, maxItems);
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(s => s).slice(0, maxItems);
  if (value) return [value].slice(0, maxItems);
  return [];
}

/**
 * Safe number extraction with bounds
 */
function safeNumber(value, min = 0, max = 100, fallback = 0) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

/**
 * Safe date extraction and normalization
 */
function safeDate(value, fallback = null) {
  if (!value) return fallback;
  
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  
  return fallback;
}

/**
 * Safe venue extraction (handles object vs string)
 */
function safeVenue(venue) {
  if (!venue) return { name: 'Venue TBA', address: '', city: '', type: '' };
  
  if (typeof venue === 'string') {
    return { name: venue.trim(), address: '', city: '', type: '' };
  }
  
  if (typeof venue === 'object') {
    return {
      name: safeString(venue.name || venue.venue || venue.venueName, 'Venue TBA'),
      address: safeString(venue.address || venue.location || venue.addr, ''),
      city: safeString(venue.city || venue.locality, ''),
      state: safeString(venue.state || venue.region, ''),
      country: safeString(venue.country, ''),
      type: safeString(venue.type || venue.venueType, ''),
      capacity: safeNumber(venue.capacity, 0, 100000, null),
      url: safeString(venue.url, '')
    };
  }
  
  return { name: 'Venue TBA', address: '', city: '', type: '' };
}

/**
 * Safe location extraction (handles various coordinate formats)
 */
function safeLocation(location, venue) {
  const defaultCoords = [-79.3832, 43.6532]; // Toronto
  
  if (location && typeof location === 'object') {
    if (location.type === 'Point' && Array.isArray(location.coordinates)) {
      const [lng, lat] = location.coordinates;
      if (typeof lng === 'number' && typeof lat === 'number') {
        return { type: 'Point', coordinates: [lng, lat] };
      }
    }
    
    if (location.lat && location.lng) {
      return { 
        type: 'Point', 
        coordinates: [parseFloat(location.lng), parseFloat(location.lat)] 
      };
    }
    
    if (location.latitude && location.longitude) {
      return { 
        type: 'Point', 
        coordinates: [parseFloat(location.longitude), parseFloat(location.latitude)] 
      };
    }
  }
  
  if (venue && typeof venue === 'object') {
    if (venue.location && typeof venue.location === 'object') {
      return safeLocation(venue.location);
    }
    
    if (venue.lat && venue.lng) {
      return { 
        type: 'Point', 
        coordinates: [parseFloat(venue.lng), parseFloat(venue.lat)] 
      };
    }
  }
  
  return { type: 'Point', coordinates: defaultCoords };
}

/**
 * Safe artist extraction (handles various formats)
 */
function safeArtists(artists) {
  const result = [];
  
  if (!artists) return result;
  
  if (Array.isArray(artists)) {
    artists.forEach(artist => {
      if (typeof artist === 'string') {
        result.push({ name: artist.trim(), id: '', url: '', image: '' });
      } else if (typeof artist === 'object' && artist.name) {
        result.push({
          name: safeString(artist.name),
          id: safeString(artist.id),
          url: safeString(artist.url),
          image: safeString(artist.image),
          genres: safeArray(artist.genres, 3)
        });
      }
    });
  } else if (typeof artists === 'string') {
    result.push({ name: artists.trim(), id: '', url: '', image: '' });
  } else if (typeof artists === 'object' && artists.name) {
    result.push({
      name: safeString(artists.name),
      id: safeString(artists.id),
      url: safeString(artists.url),
      image: safeString(artists.image)
    });
  }
  
  return result.slice(0, 10);
}

/**
 * Safe genre extraction and normalization
 */
function safeGenres(genres) {
  const normalized = safeArray(genres, 5);
  return normalized.map(genre => safeString(genre).toLowerCase()).filter(g => g.length > 0);
}

/**
 * Safe image extraction (handles various formats)
 */
function safeImages(images) {
  const result = [];
  
  if (!images) return result;
  
  if (Array.isArray(images)) {
    images.forEach(img => {
      if (typeof img === 'string') {
        result.push({ url: img, ratio: '', width: 0, height: 0 });
      } else if (typeof img === 'object' && img.url) {
        result.push({
          url: safeString(img.url),
          ratio: safeString(img.ratio),
          width: safeNumber(img.width, 0, 5000, 0),
          height: safeNumber(img.height, 0, 5000, 0)
        });
      }
    });
  } else if (typeof images === 'string') {
    result.push({ url: images, ratio: '', width: 0, height: 0 });
  } else if (typeof images === 'object' && images.url) {
    result.push({
      url: safeString(images.url),
      ratio: safeString(images.ratio),
      width: safeNumber(images.width, 0, 5000, 0),
      height: safeNumber(images.height, 0, 5000, 0)
    });
  }
  
  return result.slice(0, 5);
}

/**
 * Safe price range extraction
 */
function safePriceRange(priceRange, price) {
  if (priceRange && typeof priceRange === 'object') {
    return {
      min: safeNumber(priceRange.min, 0, 10000, 0),
      max: safeNumber(priceRange.max, 0, 10000, 0),
      currency: safeString(priceRange.currency, 'USD')
    };
  }
  
  if (price) {
    const numPrice = safeNumber(price, 0, 10000, 0);
    return { min: numPrice, max: numPrice, currency: 'USD' };
  }
  
  return { min: 0, max: 0, currency: 'USD' };
}

/**
 * Main validation function - handles ALL data inconsistencies
 */
function validateAndNormalizeEvent(event, source = 'unknown') {
  if (!event || typeof event !== 'object') {
    return null;
  }

  try {
    const venueData = safeVenue(event.venue);
    const locationData = safeLocation(event.location, event.venue);
    const artistsData = safeArtists(event.artists || event.performers || event.headliners);
    const genresData = safeGenres(event.genres || event.classifications?.map(c => c.genre?.name));
    const imagesData = safeImages(event.images || event.image);
    const priceData = safePriceRange(event.priceRange || event.priceRanges?.[0], event.price);

    return {
      id: safeString(event.sourceId || event.id, `${source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
      source: source,
      sourceId: safeString(event.sourceId || event.id, 'unknown'),
      
      name: safeString(event.name || event.title, 'Unnamed Event'),
      description: safeString(event.description || event.info, ''),
      status: safeString(event.status, 'active'),
      
      date: safeDate(event.date || event.dates?.start?.dateTime, new Date().toISOString()),
      startTime: safeString(event.startTime || event.dates?.start?.localTime, ''),
      endTime: safeString(event.endTime || event.dates?.end?.localTime, ''),
      doorTime: safeString(event.doorTime, ''),
      
      venue: venueData,
      location: locationData,
      
      images: imagesData,
      primaryImage: imagesData.length > 0 ? imagesData[0].url : '',
      image: imagesData.length > 0 ? imagesData[0].url : '',
      
      priceRange: priceData,
      price: priceData.min > 0 ? `$${priceData.min}` : '',
      ticketLimit: safeString(event.ticketLimit, ''),
      
      genres: genresData,
      classifications: safeArray(event.classifications, 3),
      
      artists: artistsData,
      artistList: artistsData.map(a => a.name),
      
      url: safeString(event.url || event.ticketUrl, ''),
      seatmap: safeString(event.seatmap, ''),
      pleaseNote: safeString(event.pleaseNote || event.info, ''),
      
      createdAt: safeDate(event.createdAt, new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      lastFetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn(`Validation error for event ${event.id}:`, error.message);
    return null;
  }
}

/**
 * Simple deduplication by source and sourceId
 */
function mergeAndDeduplicateEvents(events) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const event of events) {
    if (!event || !event.source || !event.sourceId) continue;
    
    const key = `${event.source}-${event.sourceId}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(event);
    }
  }
  
  return deduplicated;
}

/**
 * Calculate completeness score based on available fields
 */
function calculateCompletenessScore(event) {
  if (!event) return 0;
  
  let score = 0;
  
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
