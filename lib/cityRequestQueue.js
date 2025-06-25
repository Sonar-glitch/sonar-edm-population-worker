const fs = require('fs');
const path = require('path');

// File-based queue for city requests (zero-risk approach)
const QUEUE_FILE_PATH = path.join(process.cwd(), 'city_requests.json');
const PROCESSED_FILE_PATH = path.join(process.cwd(), 'processed_cities.json');

/**
 * Country name to code mapping for Ticketmaster API
 */
const COUNTRY_CODES = {
  'Canada': 'CA', 'United States': 'US', 'USA': 'US',
  'United Kingdom': 'GB', 'UK': 'GB', 'Germany': 'DE',
  'France': 'FR', 'Netherlands': 'NL', 'Spain': 'ES',
  'Italy': 'IT', 'Australia': 'AU', 'Brazil': 'BR',
  'Mexico': 'MX', 'Japan': 'JP', 'South Korea': 'KR'
};

/**
 * Get country code from country name
 */
function getCountryCode(countryName) {
  if (!countryName) return null;
  
  const normalized = countryName.trim();
  if (COUNTRY_CODES[normalized]) {
    return COUNTRY_CODES[normalized];
  }
  
  // Case-insensitive lookup
  const lowerCase = normalized.toLowerCase();
  for (const [country, code] of Object.entries(COUNTRY_CODES)) {
    if (country.toLowerCase() === lowerCase) {
      return code;
    }
  }
  
  return null;
}

/**
 * Check if country is supported by Ticketmaster
 */
function isCountrySupported(countryName) {
  return getCountryCode(countryName) !== null;
}

/**
 * Read city requests from file
 */
function readCityRequests() {
  try {
    if (!fs.existsSync(QUEUE_FILE_PATH)) {
      return [];
    }
    
    const data = fs.readFileSync(QUEUE_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading city requests:', error);
    return [];
  }
}

/**
 * Write city requests to file
 */
function writeCityRequests(requests) {
  try {
    fs.writeFileSync(QUEUE_FILE_PATH, JSON.stringify(requests, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing city requests:', error);
    return false;
  }
}

/**
 * Add a new city request to the queue
 */
function addCityRequest(city, country, latitude, longitude) {
  try {
    // Validate country support
    const countryCode = getCountryCode(country);
    if (!countryCode) {
      throw new Error(`Country "${country}" is not supported by Ticketmaster`);
    }
    
    const requests = readCityRequests();
    
    // Check if city already exists
    const existingIndex = requests.findIndex(req => 
      req.city.toLowerCase() === city.toLowerCase() && 
      req.country.toLowerCase() === country.toLowerCase()
    );
    
    const now = new Date().toISOString();
    
    if (existingIndex >= 0) {
      // Update existing request
      requests[existingIndex].requestCount = (requests[existingIndex].requestCount || 1) + 1;
      requests[existingIndex].lastRequestedAt = now;
      requests[existingIndex].status = 'pending'; // Reset status if needed
    } else {
      // Add new request
      requests.push({
        city: city.trim(),
        country: country.trim(),
        countryCode,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        requestedAt: now,
        lastRequestedAt: now,
        requestCount: 1,
        status: 'pending', // pending, processing, completed, error
        priority: getRegionalPriority(countryCode)
      });
    }
    
    // Sort by priority (higher first) and request count
    requests.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.requestCount - a.requestCount;
    });
    
    writeCityRequests(requests);
    
    return {
      success: true,
      city,
      country,
      countryCode,
      isNew: existingIndex < 0
    };
    
  } catch (error) {
    console.error('Error adding city request:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get pending city requests for worker processing
 */
function getPendingCityRequests() {
  const requests = readCityRequests();
  return requests.filter(req => req.status === 'pending');
}

/**
 * Mark city request as processing
 */
function markCityAsProcessing(city, country) {
  const requests = readCityRequests();
  const index = requests.findIndex(req => 
    req.city.toLowerCase() === city.toLowerCase() && 
    req.country.toLowerCase() === country.toLowerCase()
  );
  
  if (index >= 0) {
    requests[index].status = 'processing';
    requests[index].processingStartedAt = new Date().toISOString();
    writeCityRequests(requests);
    return true;
  }
  
  return false;
}

/**
 * Mark city request as completed
 */
function markCityAsCompleted(city, country, eventCount = 0) {
  const requests = readCityRequests();
  const index = requests.findIndex(req => 
    req.city.toLowerCase() === city.toLowerCase() && 
    req.country.toLowerCase() === country.toLowerCase()
  );
  
  if (index >= 0) {
    requests[index].status = 'completed';
    requests[index].completedAt = new Date().toISOString();
    requests[index].eventCount = eventCount;
    writeCityRequests(requests);
    
    // Also add to processed cities log
    addToProcessedCities(city, country, eventCount);
    return true;
  }
  
  return false;
}

/**
 * Mark city request as error
 */
function markCityAsError(city, country, errorMessage) {
  const requests = readCityRequests();
  const index = requests.findIndex(req => 
    req.city.toLowerCase() === city.toLowerCase() && 
    req.country.toLowerCase() === country.toLowerCase()
  );
  
  if (index >= 0) {
    requests[index].status = 'error';
    requests[index].errorMessage = errorMessage;
    requests[index].errorAt = new Date().toISOString();
    writeCityRequests(requests);
    return true;
  }
  
  return false;
}

/**
 * Add to processed cities log
 */
function addToProcessedCities(city, country, eventCount) {
  try {
    let processed = [];
    if (fs.existsSync(PROCESSED_FILE_PATH)) {
      const data = fs.readFileSync(PROCESSED_FILE_PATH, 'utf8');
      processed = JSON.parse(data);
    }
    
    processed.push({
      city,
      country,
      eventCount,
      processedAt: new Date().toISOString()
    });
    
    // Keep only last 100 processed cities
    if (processed.length > 100) {
      processed = processed.slice(-100);
    }
    
    fs.writeFileSync(PROCESSED_FILE_PATH, JSON.stringify(processed, null, 2));
  } catch (error) {
    console.error('Error updating processed cities log:', error);
  }
}

/**
 * Get regional priority for processing order
 */
function getRegionalPriority(countryCode) {
  const priorities = {
    'US': 100, 'CA': 95, 'GB': 90, 'AU': 85,
    'DE': 80, 'FR': 75, 'NL': 70, 'ES': 65,
    'IT': 60, 'BR': 55, 'MX': 50, 'JP': 45
  };
  
  return priorities[countryCode] || 30;
}

/**
 * Get queue statistics
 */
function getQueueStats() {
  const requests = readCityRequests();
  
  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    processing: requests.filter(r => r.status === 'processing').length,
    completed: requests.filter(r => r.status === 'completed').length,
    error: requests.filter(r => r.status === 'error').length,
    topCountries: {}
  };
  
  // Count by country
  requests.forEach(req => {
    stats.topCountries[req.country] = (stats.topCountries[req.country] || 0) + 1;
  });
  
  return stats;
}

/**
 * Clean up old completed requests (keep system lean)
 */
function cleanupOldRequests() {
  const requests = readCityRequests();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const filtered = requests.filter(req => {
    if (req.status === 'completed' && req.completedAt) {
      const completedDate = new Date(req.completedAt);
      return completedDate > oneWeekAgo;
    }
    return true; // Keep pending, processing, and error requests
  });
  
  if (filtered.length !== requests.length) {
    writeCityRequests(filtered);
    console.log(`🧹 Cleaned up ${requests.length - filtered.length} old city requests`);
  }
}

module.exports = {
  addCityRequest,
  getPendingCityRequests,
  markCityAsProcessing,
  markCityAsCompleted,
  markCityAsError,
  getQueueStats,
  cleanupOldRequests,
  isCountrySupported,
  getCountryCode,
  readCityRequests
};

