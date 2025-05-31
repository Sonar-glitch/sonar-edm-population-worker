/**
 * File: eventAttributeExtraction.js
 * Description: Extracts musical attributes from events using multiple sources
 * Location: /c/sonar/heroku-workers/event-population/eventAttributeExtraction.js
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Spotify API credentials
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

/**
 * Main function to extract and update event attributes
 * @param {Object} event - Event object to process
 * @returns {Promise<Object>} - Updated event with musical attributes
 */
const extractEventAttributes = async (event) => {
  try {
    if (!event) {
      console.error('No event provided for attribute extraction');
      return null;
    }
    
    console.log(`Extracting attributes for event: ${event.name}`);
    
    // Initialize attributes with default values
    let attributes = {
      energy: 0.5,
      danceability: 0.5,
      tempo: 120,
      valence: 0.5,
      acousticness: 0.5,
      instrumentalness: 0.5,
      liveness: 0.5,
      confidence: 0.1 // Initial confidence is low
    };
    
    // Extract attributes from multiple sources
    const sources = [
      { method: extractFromArtists, weight: 0.6 },
      { method: extractFromGenres, weight: 0.3 },
      { method: extractFromVenueHistory, weight: 0.2 },
      { method: extractFromDescription, weight: 0.1 }
    ];
    
    let totalWeight = 0;
    let totalConfidence = 0;
    
    for (const source of sources) {
      try {
        const result = await source.method(event);
        
        if (result && result.attributes) {
          // Apply weighted average for each attribute
          Object.keys(attributes).forEach(attr => {
            if (attr !== 'confidence' && result.attributes[attr] !== undefined) {
              attributes[attr] = 
                (attributes[attr] * totalWeight + result.attributes[attr] * source.weight * result.confidence) / 
                (totalWeight + source.weight * result.confidence);
            }
          });
          
          totalWeight += source.weight * result.confidence;
          totalConfidence += result.confidence * source.weight;
        }
      } catch (error) {
        console.error(`Error in attribute extraction source: ${error.message}`);
        // Continue with other sources
      }
    }
    
    // Calculate overall confidence
    attributes.confidence = totalWeight > 0 ? totalConfidence / sources.reduce((sum, s) => sum + s.weight, 0) : 0.1;
    
    // Update event with extracted attributes
    event.musicAttributes = attributes;
    
    return event;
  } catch (error) {
    console.error(`Error extracting event attributes: ${error.message}`);
    return event;
  }
};

/**
 * Extract attributes from event artists using Spotify API
 * @param {Object} event - Event object
 * @returns {Promise<Object>} - Extracted attributes with confidence
 */
const extractFromArtists = async (event) => {
  try {
    if (!event.artists || !Array.isArray(event.artists) || event.artists.length === 0) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Get Spotify access token
    const token = await getSpotifyToken();
    
    // Extract artist names
    const artistNames = event.artists.map(artist => 
      typeof artist === 'string' ? artist : artist.name
    ).filter(name => name);
    
    if (artistNames.length === 0) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Search for artists on Spotify
    const artistData = await Promise.all(
      artistNames.map(name => searchSpotifyArtist(name, token))
    );
    
    // Filter out failed searches
    const validArtistData = artistData.filter(data => data && data.id);
    
    if (validArtistData.length === 0) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Get top tracks for each artist
    const topTracks = await Promise.all(
      validArtistData.map(artist => getArtistTopTracks(artist.id, token))
    );
    
    // Flatten and filter track lists
    const allTrackIds = topTracks
      .flat()
      .filter(track => track && track.id)
      .map(track => track.id);
    
    if (allTrackIds.length === 0) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Get audio features for tracks
    const audioFeatures = await getAudioFeatures(allTrackIds, token);
    
    if (!audioFeatures || audioFeatures.length === 0) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Calculate average audio features
    const attributes = calculateAverageFeatures(audioFeatures);
    
    // Calculate confidence based on number of tracks found
    const confidence = Math.min(1.0, audioFeatures.length / 10);
    
    return { attributes, confidence };
  } catch (error) {
    console.error(`Error extracting from artists: ${error.message}`);
    return { attributes: {}, confidence: 0 };
  }
};

/**
 * Extract attributes from event genres
 * @param {Object} event - Event object
 * @returns {Promise<Object>} - Extracted attributes with confidence
 */
const extractFromGenres = async (event) => {
  try {
    if (!event.genres || !Array.isArray(event.genres) || event.genres.length === 0) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Genre to attributes mapping
    const genreAttributes = {
      'techno': {
        energy: 0.8,
        danceability: 0.7,
        tempo: 130,
        valence: 0.5,
        acousticness: 0.1,
        instrumentalness: 0.8,
        liveness: 0.3
      },
      'house': {
        energy: 0.7,
        danceability: 0.8,
        tempo: 125,
        valence: 0.6,
        acousticness: 0.1,
        instrumentalness: 0.6,
        liveness: 0.3
      },
      'trance': {
        energy: 0.9,
        danceability: 0.7,
        tempo: 138,
        valence: 0.5,
        acousticness: 0.05,
        instrumentalness: 0.7,
        liveness: 0.2
      },
      'drum and bass': {
        energy: 0.9,
        danceability: 0.7,
        tempo: 170,
        valence: 0.5,
        acousticness: 0.1,
        instrumentalness: 0.5,
        liveness: 0.4
      },
      'dubstep': {
        energy: 0.8,
        danceability: 0.6,
        tempo: 140,
        valence: 0.4,
        acousticness: 0.1,
        instrumentalness: 0.5,
        liveness: 0.3
      },
      'ambient': {
        energy: 0.3,
        danceability: 0.3,
        tempo: 90,
        valence: 0.5,
        acousticness: 0.3,
        instrumentalness: 0.8,
        liveness: 0.1
      }
      // Add more genres as needed
    };
    
    // Initialize attributes
    const attributes = {
      energy: 0,
      danceability: 0,
      tempo: 0,
      valence: 0,
      acousticness: 0,
      instrumentalness: 0,
      liveness: 0
    };
    
    let matchCount = 0;
    
    // Process each genre
    for (const genre of event.genres) {
      const genreLower = genre.toLowerCase();
      
      // Check for exact match
      if (genreAttributes[genreLower]) {
        Object.keys(attributes).forEach(attr => {
          attributes[attr] += genreAttributes[genreLower][attr];
        });
        matchCount++;
        continue;
      }
      
      // Check for partial match
      for (const [key, value] of Object.entries(genreAttributes)) {
        if (genreLower.includes(key) || key.includes(genreLower)) {
          Object.keys(attributes).forEach(attr => {
            attributes[attr] += value[attr];
          });
          matchCount++;
          break;
        }
      }
    }
    
    // Calculate average if matches found
    if (matchCount > 0) {
      Object.keys(attributes).forEach(attr => {
        attributes[attr] /= matchCount;
      });
      
      // Calculate confidence based on number of genre matches
      const confidence = Math.min(1.0, matchCount / event.genres.length);
      
      return { attributes, confidence };
    }
    
    return { attributes: {}, confidence: 0 };
  } catch (error) {
    console.error(`Error extracting from genres: ${error.message}`);
    return { attributes: {}, confidence: 0 };
  }
};

/**
 * Extract attributes from venue history
 * @param {Object} event - Event object
 * @returns {Promise<Object>} - Extracted attributes with confidence
 */
const extractFromVenueHistory = async (event) => {
  try {
    if (!event.venue || !event.venue.name) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Get past events at this venue
    const Event = mongoose.model('Event');
    const pastEvents = await Event.find({
      'venue.name': event.venue.name,
      'musicAttributes': { $exists: true },
      'dates.start.dateTime': { $lt: new Date() }
    }).sort({ 'dates.start.dateTime': -1 }).limit(10);
    
    if (!pastEvents || pastEvents.length === 0) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Initialize attributes
    const attributes = {
      energy: 0,
      danceability: 0,
      tempo: 0,
      valence: 0,
      acousticness: 0,
      instrumentalness: 0,
      liveness: 0
    };
    
    // Calculate average attributes from past events
    pastEvents.forEach(pastEvent => {
      if (pastEvent.musicAttributes) {
        Object.keys(attributes).forEach(attr => {
          if (pastEvent.musicAttributes[attr] !== undefined) {
            attributes[attr] += pastEvent.musicAttributes[attr];
          }
        });
      }
    });
    
    Object.keys(attributes).forEach(attr => {
      attributes[attr] /= pastEvents.length;
    });
    
    // Calculate confidence based on number of past events
    const confidence = Math.min(0.7, pastEvents.length / 10);
    
    return { attributes, confidence };
  } catch (error) {
    console.error(`Error extracting from venue history: ${error.message}`);
    return { attributes: {}, confidence: 0 };
  }
};

/**
 * Extract attributes from event description using NLP
 * @param {Object} event - Event object
 * @returns {Promise<Object>} - Extracted attributes with confidence
 */
const extractFromDescription = async (event) => {
  try {
    if (!event.description) {
      return { attributes: {}, confidence: 0 };
    }
    
    // Keywords to attributes mapping
    const keywordMap = {
      // Energy keywords
      'energetic': { attr: 'energy', value: 0.9 },
      'high energy': { attr: 'energy', value: 0.9 },
      'powerful': { attr: 'energy', value: 0.8 },
      'intense': { attr: 'energy', value: 0.8 },
      'dynamic': { attr: 'energy', value: 0.7 },
      'chill': { attr: 'energy', value: 0.3 },
      'relaxed': { attr: 'energy', value: 0.2 },
      'ambient': { attr: 'energy', value: 0.2 },
      
      // Danceability keywords
      'danceable': { attr: 'danceability', value: 0.9 },
      'groovy': { attr: 'danceability', value: 0.8 },
      'rhythmic': { attr: 'danceability', value: 0.7 },
      'dance floor': { attr: 'danceability', value: 0.8 },
      'beat': { attr: 'danceability', value: 0.7 },
      
      // Tempo keywords
      'fast': { attr: 'tempo', value: 140 },
      'uptempo': { attr: 'tempo', value: 130 },
      'slow': { attr: 'tempo', value: 90 },
      'downtempo': { attr: 'tempo', value: 100 },
      'bpm': { attr: 'tempo', special: true }, // Special case, extract number
      
      // Valence keywords
      'happy': { attr: 'valence', value: 0.8 },
      'uplifting': { attr: 'valence', value: 0.8 },
      'positive': { attr: 'valence', value: 0.7 },
      'dark': { attr: 'valence', value: 0.3 },
      'melancholic': { attr: 'valence', value: 0.2 },
      'emotional': { attr: 'valence', value: 0.4 },
      
      // Acousticness keywords
      'acoustic': { attr: 'acousticness', value: 0.8 },
      'live instruments': { attr: 'acousticness', value: 0.7 },
      'electronic': { attr: 'acousticness', value: 0.2 },
      'digital': { attr: 'acousticness', value: 0.1 },
      
      // Instrumentalness keywords
      'instrumental': { attr: 'instrumentalness', value: 0.8 },
      'vocals': { attr: 'instrumentalness', value: 0.2 },
      'vocal': { attr: 'instrumentalness', value: 0.2 },
      'singer': { attr: 'instrumentalness', value: 0.1 },
      
      // Liveness keywords
      'live': { attr: 'liveness', value: 0.8 },
      'concert': { attr: 'liveness', value: 0.7 },
      'performance': { attr: 'liveness', value: 0.6 },
      'studio': { attr: 'liveness', value: 0.2 }
    };
    
    // Initialize attributes and counts
    const attributes = {
      energy: 0,
      danceability: 0,
      tempo: 0,
      valence: 0,
      acousticness: 0,
      instrumentalness: 0,
      liveness: 0
    };
    
    const counts = {
      energy: 0,
      danceability: 0,
      tempo: 0,
      valence: 0,
      acousticness: 0,
      instrumentalness: 0,
      liveness: 0
    };
    
    // Convert description to lowercase for matching
    const descLower = event.description.toLowerCase();
    
    // Check for each keyword
    for (const [keyword, mapping] of Object.entries(keywordMap)) {
      if (descLower.includes(keyword)) {
        if (mapping.special && keyword === 'bpm') {
          // Special case for BPM
          const bpmMatch = descLower.match(/\d+\s*bpm/);
          if (bpmMatch) {
            const bpm = parseInt(bpmMatch[0]);
            if (!isNaN(bpm) && bpm > 0) {
              attributes.tempo += bpm;
              counts.tempo++;
            }
          }
        } else {
          attributes[mapping.attr] += mapping.value;
          counts[mapping.attr]++;
        }
      }
    }
    
    // Calculate averages for attributes with matches
    Object.keys(attributes).forEach(attr => {
      if (counts[attr] > 0) {
        attributes[attr] /= counts[attr];
      } else {
        delete attributes[attr]; // Remove attributes with no matches
      }
    });
    
    // Calculate confidence based on number of keyword matches
    const totalMatches = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const confidence = Math.min(0.6, totalMatches / 10);
    
    return { attributes, confidence };
  } catch (error) {
    console.error(`Error extracting from description: ${error.message}`);
    return { attributes: {}, confidence: 0 };
  }
};

/**
 * Get Spotify API access token
 * @returns {Promise<string>} - Access token
 */
const getSpotifyToken = async () => {
  try {
    const response = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      params: {
        grant_type: 'client_credentials'
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
      }
    });
    
    return response.data.access_token;
  } catch (error) {
    console.error(`Error getting Spotify token: ${error.message}`);
    throw error;
  }
};

/**
 * Search for artist on Spotify
 * @param {string} name - Artist name
 * @param {string} token - Spotify access token
 * @returns {Promise<Object>} - Artist data
 */
const searchSpotifyArtist = async (name, token) => {
  try {
    const response = await axios({
      method: 'get',
      url: 'https://api.spotify.com/v1/search',
      params: {
        q: name,
        type: 'artist',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.data.artists.items.length > 0) {
      return response.data.artists.items[0];
    }
    
    return null;
  } catch (error) {
    console.error(`Error searching Spotify artist: ${error.message}`);
    return null;
  }
};

/**
 * Get artist's top tracks from Spotify
 * @param {string} artistId - Spotify artist ID
 * @param {string} token - Spotify access token
 * @returns {Promise<Array>} - Top tracks
 */
const getArtistTopTracks = async (artistId, token) => {
  try {
    const response = await axios({
      method: 'get',
      url: `https://api.spotify.com/v1/artists/${artistId}/top-tracks`,
      params: {
        market: 'US'
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data.tracks || [];
  } catch (error) {
    console.error(`Error getting artist top tracks: ${error.message}`);
    return [];
  }
};

/**
 * Get audio features for tracks from Spotify
 * @param {Array} trackIds - Array of track IDs
 * @param {string} token - Spotify access token
 * @returns {Promise<Array>} - Audio features
 */
const getAudioFeatures = async (trackIds, token) => {
  try {
    // Spotify API limits to 100 tracks per request
    const chunks = [];
    for (let i = 0; i < trackIds.length; i += 100) {
      chunks.push(trackIds.slice(i, i + 100));
    }
    
    const featuresPromises = chunks.map(chunk => {
      return axios({
        method: 'get',
        url: 'https://api.spotify.com/v1/audio-features',
        params: {
          ids: chunk.join(',')
        },
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    });
    
    const responses = await Promise.all(featuresPromises);
    
    // Combine all audio features
    const allFeatures = responses.reduce((acc, response) => {
      return [...acc, ...(response.data.audio_features || [])];
    }, []);
    
    return allFeatures.filter(feature => feature !== null);
  } catch (error) {
    console.error(`Error getting audio features: ${error.message}`);
    return [];
  }
};

/**
 * Calculate average audio features from multiple tracks
 * @param {Array} features - Array of audio features
 * @returns {Object} - Average features
 */
const calculateAverageFeatures = (features) => {
  if (!features || features.length === 0) {
    return {};
  }
  
  const attributes = {
    energy: 0,
    danceability: 0,
    tempo: 0,
    valence: 0,
    acousticness: 0,
    instrumentalness: 0,
    liveness: 0
  };
  
  features.forEach(feature => {
    Object.keys(attributes).forEach(attr => {
      if (feature[attr] !== undefined) {
        attributes[attr] += feature[attr];
      }
    });
  });
  
  Object.keys(attributes).forEach(attr => {
    attributes[attr] /= features.length;
  });
  
  return attributes;
};

/**
 * Process all events to extract and update attributes
 * @returns {Promise<number>} - Number of events processed
 */
const processAllEvents = async () => {
  try {
    const Event = mongoose.model('Event');
    
    // Get events without attributes or with low confidence
    const events = await Event.find({
      $or: [
        { musicAttributes: { $exists: false } },
        { 'musicAttributes.confidence': { $lt: 0.5 } }
      ]
    }).limit(100);
    
    console.log(`Found ${events.length} events to process`);
    
    let processedCount = 0;
    
    for (const event of events) {
      try {
        const updatedEvent = await extractEventAttributes(event);
        
        if (updatedEvent && updatedEvent.musicAttributes) {
          await Event.updateOne(
            { _id: event._id },
            { $set: { musicAttributes: updatedEvent.musicAttributes } }
          );
          
          processedCount++;
        }
      } catch (error) {
        console.error(`Error processing event ${event._id}: ${error.message}`);
      }
    }
    
    console.log(`Successfully processed ${processedCount} events`);
    return processedCount;
  } catch (error) {
    console.error(`Error in processAllEvents: ${error.message}`);
    return 0;
  }
};

module.exports = {
  extractEventAttributes,
  processAllEvents
};
