import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { connectToDatabase } from '../../../lib/mongodb';
import { getCachedData, setCachedData } from '../../../lib/cache';
import EDMTrainService from '../../../services/EDMTrainService';

const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { lat = '43.65', lon = '-79.38', city = 'Toronto', radius = '50' } = req.query;

    console.log(`🎯 Events API called for ${city} (${lat}, ${lon})`);

    // CACHING INTEGRATION: Check cache first
    const cacheKey = `events_${city}_${lat}_${lon}_${radius}`;
    const cachedEvents = await getCachedData(cacheKey, 'EVENTS');
    
    if (cachedEvents) {
      console.log(`🚀 Cache hit - returning ${cachedEvents.length} cached events`);
      return res.status(200).json({
        events: cachedEvents,
        total: cachedEvents.length,
        source: "cache",
        timestamp: new Date().toISOString(),
        location: { city, lat, lon }
      });
    }

    let realEvents = [];
    let apiError = null;

    // Try to fetch real events from MongoDB with retry logic (preserving original structure)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}: Fetching MongoDB events...`);
        
        // UNIFIED ARCHITECTURE: Query events_unified collection instead of events
        const { db } = await connectToDatabase();
        const eventsCollection = db.collection('events_unified');
        
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        const radiusInMeters = parseInt(radius) * 1000;
        
        const mongoEvents = await eventsCollection.find({
          location: {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [longitude, latitude]
              },
              $maxDistance: radiusInMeters
            }
          },
          date: { $gte: new Date() },
          status: { $ne: 'cancelled' }
        })
        .limit(50)
        .sort({ date: 1 })
        .toArray();

        // Transform MongoDB data to match Ticketmaster structure (preserving original logic)
        const data = {
          _embedded: {
            events: mongoEvents.map(event => ({
              id: event.sourceId || event._id.toString(),
              name: event.name,
              dates: {
                start: {
                  localDate: event.date ? event.date.toISOString().split('T')[0] : null,
                  localTime: event.startTime
                }
              },
              _embedded: {
                venues: [{
                  name: event.venue?.name,
                  address: { line1: event.venue?.address },
                  city: { name: event.venue?.city }
                }],
                attractions: (event.artistList || event.artists?.map(a => a.name) || []).map(name => ({ name }))
              },
              url: event.url,
              priceRanges: event.priceRange ? [{ min: event.priceRange.min, max: event.priceRange.max }] : null,
              classifications: event.genres ? [{ genre: { name: event.genres[0] } }] : null
            }))
          }
        };
        
        if (data._embedded && data._embedded.events) {
          realEvents = data._embedded.events.map(event => {
            const venue = event._embedded?.venues?.[0];
            const artists = event._embedded?.attractions?.map(a => a.name) || [];
            
            // IMPROVED: Enhanced genre detection from artist names
            const artistGenres = detectGenresFromArtists(artists);
            
            // IMPROVED: Enhanced relevance scoring with proper cap at 99%
            const edmKeywords = ['house', 'techno', 'electronic', 'edm', 'dance', 'trance', 'dubstep', 'drum', 'bass'];
            const eventText = `${event.name} ${artists.join(' ')} ${event.classifications?.[0]?.genre?.name || ''}`.toLowerCase();
            const edmMatches = edmKeywords.filter(keyword => eventText.includes(keyword)).length;
            
            // Calculate base score (70-85) + EDM bonus (0-15) + artist genre bonus (0-14) = max 99%
            const baseScore = Math.min(70 + (edmMatches * 3), 85);
            const genreBonus = artistGenres.length > 0 ? Math.min(artistGenres.length * 2, 14) : 0;
            const finalScore = Math.min(baseScore + genreBonus, 99);
            
            // IMPROVED: Better date/time formatting
            const eventDate = event.dates?.start?.localDate ? new Date(event.dates?.start?.localDate) : null;
            const formattedDate = eventDate ? 
              eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 
              'Date TBA';
            
            const formattedTime = event.dates?.start?.localTime ? 
              formatTime(event.dates?.start?.localTime) : 
              'Time TBA';
            
            // IMPROVED: Better venue type detection
            const venueType = detectVenueType(venue?.name || '', event.name);
            
            return {
              id: event.id,
              name: event.name,
              date: event.dates?.start?.localDate,
              time: event.dates?.start?.localTime,
              formattedDate: formattedDate,
              formattedTime: formattedTime,
              venue: venue?.name || 'Venue TBA',
              address: venue?.address?.line1 || venue?.city?.name || 'Address TBA',
              city: venue?.city?.name || city,
              ticketUrl: event.url,
              priceRange: event.priceRanges?.[0] ? `$${event.priceRanges[0].min}-${event.priceRanges[0].max}` : 'Price TBA',
              headliners: artists.slice(0, 3),
              matchScore: finalScore,
              source: 'mongodb',
              venueType: venueType,
              detectedGenres: artistGenres
            };
          });

          console.log(`✅ Successfully fetched ${realEvents.length} real events from MongoDB (events_unified collection)`);
          break; // Success, exit retry loop
        }
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed:`, error.message);
        apiError = error;
        if (attempt === 3) {
          console.error('🚨 All MongoDB attempts failed');
        }
      }
    }

    // EDMTRAIN INTEGRATION: Fetch additional events from EDMTrain
    let edmTrainEvents = [];
    try {
      console.log(`🎵 Fetching EDMTrain events for ${city}...`);
      
      const rawEdmEvents = await EDMTrainService.fetchEvents({
        city,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        radius: parseInt(radius)
      });
      
      // Deduplicate EDMTrain events against MongoDB events
      const uniqueEdmEvents = EDMTrainService.deduplicateEvents(realEvents, rawEdmEvents);
      
      edmTrainEvents = uniqueEdmEvents;
      console.log(`✅ Added ${edmTrainEvents.length} unique EDMTrain events`);
      
    } catch (edmError) {
      console.error('⚠️ EDMTrain fetch failed:', edmError.message);
      // Continue without EDMTrain events - don't break the main flow
    }

    // Combine MongoDB and EDMTrain events
    const combinedEvents = [...realEvents, ...edmTrainEvents];

    // Enhanced fallback logic - only use emergency samples if NO real events from any source
    let finalEvents = combinedEvents;
    
    if (combinedEvents.length === 0) {
      console.log('⚠️ No real events found from any source, using emergency fallback samples');
      
      const emergencyEvents = [
        {
          id: 'emergency-1',
          name: 'Emergency EDM Night',
          date: '2025-07-15',
          formattedDate: 'Tue, Jul 15',
          formattedTime: '10:00 PM',
          venue: 'Local Club',
          address: 'Downtown Area',
          city: city,
          ticketUrl: '#',
          matchScore: 75,
          source: 'emergency',
          headliners: ['Local DJ'],
          venueType: 'Club',
          detectedGenres: ['house', 'techno']
        }
      ];
      
      finalEvents = emergencyEvents;
    }

    // IMPROVED: Sort by match score first, then by date (most recent first)
    finalEvents.sort((a, b) => {
      // First sort by match score (highest first)
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      
      // If match scores are equal, sort by date (most recent first)
      const dateA = a.date ? new Date(a.date) : new Date(9999, 11, 31); // Far future for null dates
      const dateB = b.date ? new Date(b.date) : new Date(9999, 11, 31);
      
      return dateA - dateB;
    });

    console.log(`🎯 Returning ${finalEvents.length} events from unified collection (${realEvents.length} MongoDB + ${edmTrainEvents.length} EDMTrain + ${finalEvents.length - realEvents.length - edmTrainEvents.length} emergency)`);

    // CACHING INTEGRATION: Cache the final processed events for 12 hours
    await setCachedData(cacheKey, finalEvents, 'EVENTS');
    console.log(`💾 Cached ${finalEvents.length} events for ${city}`);

    res.status(200).json({
      events: finalEvents,
      total: finalEvents.length,
      mongoCount: realEvents.length,
      edmTrainCount: edmTrainEvents.length,
      source: combinedEvents.length > 0 ? "live" : "emergency",
      timestamp: new Date().toISOString(),
      location: { city, lat, lon }
    });

  } catch (error) {
    console.error('🚨 Events API critical error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch events',
      error: error.message,
      events: [],
      total: 0
    });
  }
}

// IMPROVED: Helper function to format time
function formatTime(timeString) {
  if (!timeString) return 'Time TBA';
  
  try {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:${minutes} ${ampm}`;
  } catch (error) {
    return timeString;
  }
}

// IMPROVED: Helper function to detect venue type
function detectVenueType(venueName, eventName) {
  const venueNameLower = venueName.toLowerCase();
  const eventNameLower = eventName.toLowerCase();
  
  if (venueNameLower.includes('club') || venueNameLower.includes('lounge') || venueNameLower.includes('bar')) {
    return 'Club';
  }
  
  if (venueNameLower.includes('hall') || venueNameLower.includes('theatre') || venueNameLower.includes('theater')) {
    return 'Concert Hall';
  }
  
  if (venueNameLower.includes('arena') || venueNameLower.includes('stadium') || venueNameLower.includes('centre') || venueNameLower.includes('center')) {
    return 'Arena';
  }
  
  if (venueNameLower.includes('festival') || eventNameLower.includes('festival') || eventNameLower.includes('fest')) {
    return 'Festival';
  }
  
  return 'Venue';
}

// IMPROVED: Helper function to detect genres from artists
function detectGenresFromArtists(artists) {
  // Simple artist-to-genre mapping database
  const artistGenreMap = {
    // House DJs
    'deadmau5': ['progressive house', 'electro house'],
    'eric prydz': ['progressive house', 'techno'],
    'kaskade': ['progressive house', 'deep house'],
    'claude vonstroke': ['tech house', 'deep house'],
    'fisher': ['tech house'],
    'chris lake': ['tech house', 'house'],
    'john summit': ['tech house', 'house'],
    'dom dolla': ['tech house', 'house'],
    'camelphat': ['tech house', 'deep house'],
    
    // Techno DJs
    'charlotte de witte': ['techno'],
    'amelie lens': ['techno'],
    'adam beyer': ['techno'],
    'carl cox': ['techno', 'house'],
    'nina kraviz': ['techno'],
    'richie hawtin': ['techno', 'minimal'],
    'boris brejcha': ['high-tech minimal', 'techno'],
    
    // Trance DJs
    'armin van buuren': ['trance', 'progressive trance'],
    'above & beyond': ['trance', 'progressive trance'],
    'paul van dyk': ['trance'],
    'ferry corsten': ['trance'],
    'aly & fila': ['trance', 'uplifting trance'],
    
    // Bass Music
    'skrillex': ['dubstep', 'bass house'],
    'excision': ['dubstep', 'bass'],
    'illenium': ['future bass', 'melodic dubstep'],
    'zeds dead': ['dubstep', 'bass house'],
    'subtronics': ['dubstep', 'bass'],
    
    // Mainstream EDM
    'martin garrix': ['big room', 'progressive house'],
    'david guetta': ['house', 'big room'],
    'tiesto': ['big room', 'progressive house'],
    'calvin harris': ['house', 'electro house'],
    'marshmello': ['future bass', 'trap'],
    'the chainsmokers': ['future bass', 'pop'],
    
    // Drum & Bass
    'pendulum': ['drum and bass'],
    'netsky': ['drum and bass'],
    'andy c': ['drum and bass'],
    'sub focus': ['drum and bass'],
    'wilkinson': ['drum and bass']
  };
  
  const detectedGenres = new Set();
  
  artists.forEach(artist => {
    const artistLower = artist.toLowerCase();
    
    // Check for exact matches
    if (artistGenreMap[artistLower]) {
      artistGenreMap[artistLower].forEach(genre => detectedGenres.add(genre));
      return;
    }
    
    // Check for partial matches
    for (const [mappedArtist, genres] of Object.entries(artistGenreMap)) {
      if (artistLower.includes(mappedArtist) || mappedArtist.includes(artistLower)) {
        genres.forEach(genre => detectedGenres.add(genre));
      }
    }
  });
  
  return Array.from(detectedGenres);
}
