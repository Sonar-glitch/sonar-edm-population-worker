const mongoose = require("mongoose");
const TicketmasterEvent = require("./models/TicketmasterEvent");

// SURGICAL FIX: Import unified processing (THIS WAS MISSING!)
const { processUnifiedEvents } = require("./processUnifiedEvents");

// Import the city request queue utilities
const { 
  getPendingCityRequests, 
  markCityAsProcessing, 
  markCityAsCompleted, 
  markCityAsError,
  cleanupOldRequests,
  getQueueStats
} = require("./lib/cityRequestQueue");

// Original constants (preserved)
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

// Original Canadian cities (preserved)
const CANADIAN_CITIES = [
    "Toronto", "Montreal", "Vancouver", "Calgary", 
    "Edmonton", "Ottawa", "Winnipeg", "Quebec City", 
    "Hamilton", "Mississauga"
];

// Original database connection functions (preserved)
async function connectDB() {
    if (!MONGODB_URI) {
        console.error("Error: MONGODB_URI is not defined in .env file");
        process.exit(1);
    }
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("MongoDB Connected...");
    } catch (err) {
        console.error("MongoDB connection error:", err.message);
        process.exit(1);
    }
}

async function disconnectDB() {
    try {
        await mongoose.disconnect();
        console.log("MongoDB Disconnected.");
    } catch (err) {
        console.error("Error disconnecting MongoDB:", err.message);
    }
}

// SURGICAL FIX: Enhanced main function with unified processing
async function main() {
    console.log("🚀 SURGICAL FIX: Enhanced Ticketmaster Worker Starting...");
    console.log("📅 Timestamp:", new Date().toISOString());
    console.log("🎯 Goal: Fix architectural bypass and trigger unified processing");
    
    await connectDB();
    
    try {
        // Clean up old requests first
        try {
          await cleanupOldRequests();
          const queueStats = await getQueueStats();
          console.log("📊 Queue Statistics:", queueStats);
        } catch (queueError) {
          console.warn("⚠️ Queue operations failed:", queueError.message);
        }
        
        // PHASE 1: Process original Canadian cities
        console.log("\n🇨🇦 PHASE 1: Processing Canadian Cities");
        const canadianResults = await processAllCities(CANADIAN_CITIES, 'CA');
        console.log(`✅ Canadian cities processed: ${canadianResults.totalEvents} events`);
        
        // SURGICAL FIX: MANDATORY unified processing after Canadian cities
        console.log("\n🔄 SURGICAL FIX: Triggering unified processing for Canadian cities...");
        try {
            const unifiedResult = await processUnifiedEvents();
            console.log("✅ SURGICAL FIX: Unified processing completed successfully");
            console.log(`📊 Unified events created: ${unifiedResult.processedCount || 'Unknown'}`);
        } catch (unifiedError) {
            console.error("🚨 SURGICAL FIX: Unified processing failed:", unifiedError.message);
            // Don't exit - continue with dynamic cities
        }
        
        // PHASE 2: Process dynamic city requests
        console.log("\n🌍 PHASE 2: Processing Dynamic City Requests");
        let dynamicResults = { totalEvents: 0, citiesProcessed: 0 };
        
        try {
          dynamicResults = await processDynamicCityRequests();
          console.log(`✅ Dynamic cities processed: ${dynamicResults.totalEvents} events`);
          
          // SURGICAL FIX: MANDATORY unified processing after dynamic cities
          if (dynamicResults.totalEvents > 0) {
              console.log("\n🔄 SURGICAL FIX: Triggering unified processing for dynamic cities...");
              try {
                  const dynamicUnifiedResult = await processUnifiedEvents();
                  console.log("✅ SURGICAL FIX: Dynamic unified processing completed");
                  console.log(`📊 Additional unified events: ${dynamicUnifiedResult.processedCount || 'Unknown'}`);
              } catch (dynamicUnifiedError) {
                  console.error("🚨 SURGICAL FIX: Dynamic unified processing failed:", dynamicUnifiedError.message);
              }
          }
          
        } catch (queueError) {
          console.warn("⚠️ Dynamic city processing failed:", queueError.message);
        }
        
        // PHASE 3: Summary with architectural bypass status
        const totalEvents = canadianResults.totalEvents + dynamicResults.totalEvents;
        console.log(`\n🎯 SURGICAL FIX: WORKER COMPLETED SUCCESSFULLY`);
        console.log(`📊 Total raw events processed: ${totalEvents}`);
        console.log(`🇨🇦 Canadian events: ${canadianResults.totalEvents}`);
        console.log(`🌍 Dynamic city events: ${dynamicResults.totalEvents}`);
        console.log(`✅ ARCHITECTURAL BYPASS FIXED: Unified processing triggered`);
        console.log(`⏱️ Processing time: ${new Date().toISOString()}`);
        
        // SURGICAL FIX: Verify unified collection has data
        await verifyUnifiedCollectionHealth();
        
    } catch (error) {
        console.error("🚨 Worker failed:", error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

// SURGICAL FIX: New function to verify unified collection health
async function verifyUnifiedCollectionHealth() {
    try {
        const db = mongoose.connection.db;
        const unifiedCount = await db.collection('events_unified').countDocuments();
        const sourceCount = await db.collection('events_ticketmaster').countDocuments();
        
        console.log("\n🔍 SURGICAL FIX: Collection Health Check");
        console.log(`📊 Source events (events_ticketmaster): ${sourceCount}`);
        console.log(`📊 Unified events (events_unified): ${unifiedCount}`);
        
        if (sourceCount > 0 && unifiedCount === 0) {
            console.log("🚨 WARNING: Architectural bypass detected - source events exist but no unified events!");
            console.log("🔧 Attempting emergency unified processing...");
            
            try {
                const emergencyResult = await processUnifiedEvents();
                console.log("✅ Emergency unified processing completed");
            } catch (emergencyError) {
                console.error("❌ Emergency unified processing failed:", emergencyError.message);
            }
        } else if (unifiedCount > 0) {
            console.log("✅ SURGICAL FIX SUCCESS: Unified events collection populated");
            console.log("🎯 Cities should now show real events instead of emergency fallbacks");
        } else {
            console.log("ℹ️ No source events to process - this is normal for first run");
        }
        
    } catch (error) {
        console.error("⚠️ Health check failed:", error.message);
    }
}

// SURGICAL FIX: Enhanced processDynamicCityRequests with unified processing
async function processDynamicCityRequests() {
    try {
        const pendingRequests = await getPendingCityRequests();
        
        if (pendingRequests.length === 0) {
            console.log("ℹ️ No pending city requests to process");
            return { totalEvents: 0, citiesProcessed: 0 };
        }
        
        console.log(`📋 Found ${pendingRequests.length} pending city requests`);
        
        let totalEvents = 0;
        let citiesProcessed = 0;
        
        for (const cityRequest of pendingRequests) {
            try {
                console.log(`\n🌍 Processing: ${cityRequest.city}, ${cityRequest.country}`);
                
                // Mark as processing
                await markCityAsProcessing(cityRequest.city, cityRequest.country);
                
                // Fetch and save events
                const cityEvents = await fetchTransformAndSaveEventsForCity(
                    cityRequest.city, 
                    cityRequest.countryCode
                );
                
                // SURGICAL FIX: Immediately trigger unified processing for this city
                console.log(`🔄 SURGICAL FIX: Triggering unified processing for ${cityRequest.city}...`);
                try {
                    await processUnifiedEvents();
                    console.log(`✅ SURGICAL FIX: ${cityRequest.city} unified processing completed`);
                } catch (cityUnifiedError) {
                    console.error(`🚨 SURGICAL FIX: ${cityRequest.city} unified processing failed:`, cityUnifiedError.message);
                }
                
                // Mark as completed
                await markCityAsCompleted(cityRequest.city, cityRequest.country, cityEvents.length);
                
                totalEvents += cityEvents.length;
                citiesProcessed++;
                
                console.log(`✅ ${cityRequest.city} completed: ${cityEvents.length} events`);
                
            } catch (cityError) {
                console.error(`❌ Failed to process ${cityRequest.city}:`, cityError.message);
                await markCityAsError(cityRequest.city, cityRequest.country, cityError.message);
            }
        }
        
        return { totalEvents, citiesProcessed };
        
    } catch (error) {
        console.error("🚨 Dynamic city processing failed:", error);
        throw error;
    }
}

// Original functions preserved below (fetchTransformAndSaveEventsForCity, etc.)
// ... [Rest of the original functions remain unchanged] ...

// SURGICAL FIX: Enhanced fetchTransformAndSaveEventsForCity
async function fetchTransformAndSaveEventsForCity(city, countryCode) {
    console.log(`🎯 Fetching events for ${city} (${countryCode})`);
    
    const allEvents = [];
    let page = 0;
    const maxPages = 10;
    
    try {
        while (page < maxPages) {
            const url = `${BASE_URL}?apikey=${TICKETMASTER_API_KEY}&city=${encodeURIComponent(city)}&countryCode=${countryCode}&classificationName=music&size=200&page=${page}`;
            
            console.log(`📄 Fetching page ${page + 1} for ${city}...`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 429) {
                    console.log(`⏳ Rate limited for ${city}, waiting 2 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data._embedded || !data._embedded.events) {
                console.log(`📄 No events found on page ${page + 1} for ${city}`);
                break;
            }
            
            const events = data._embedded.events;
            console.log(`📄 Found ${events.length} events on page ${page + 1} for ${city}`);
            
            // Transform and collect events
            const transformedEvents = events.map(event => transformEvent(event, city, countryCode));
            allEvents.push(...transformedEvents);
            
            // Check if this is the last page
            if (!data.page || page >= (data.page.totalPages - 1)) {
                console.log(`📄 Reached last page (${page + 1}) for ${city}`);
                break;
            }
            
            page++;
            
            // Small delay to be respectful to the API
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`📊 Total events collected for ${city}: ${allEvents.length}`);
        
        // Save to source collection (events_ticketmaster)
        if (allEvents.length > 0) {
            await saveEventsToDatabase(allEvents);
            console.log(`💾 Saved ${allEvents.length} events to source collection for ${city}`);
        }
        
        return allEvents;
        
    } catch (error) {
        console.error(`❌ Error fetching events for ${city}:`, error.message);
        throw error;
    }
}

// Original transform and save functions (preserved)
function transformEvent(event, city, countryCode) {
    const venue = event._embedded?.venues?.[0];
    const attractions = event._embedded?.attractions || [];
    
    return {
        sourceId: event.id,
        source: 'ticketmaster',
        name: event.name,
        date: event.dates?.start?.localDate ? new Date(event.dates.start.localDate) : null,
        startTime: event.dates?.start?.localTime || null,
        venue: {
            name: venue?.name || 'Unknown Venue',
            address: venue?.address?.line1 || '',
            city: venue?.city?.name || city,
            country: venue?.country?.name || 'Unknown',
            location: venue?.location ? {
                latitude: parseFloat(venue.location.latitude),
                longitude: parseFloat(venue.location.longitude)
            } : null
        },
        artists: attractions.map(attraction => ({
            name: attraction.name,
            type: attraction.classifications?.[0]?.genre?.name || 'Unknown'
        })),
        artistList: attractions.map(attraction => attraction.name),
        genres: event.classifications?.map(c => c.genre?.name).filter(Boolean) || [],
        priceRange: event.priceRanges?.[0] ? {
            min: event.priceRanges[0].min,
            max: event.priceRanges[0].max,
            currency: event.priceRanges[0].currency
        } : null,
        url: event.url,
        ticketLimit: typeof event.ticketLimit === 'object' ? 
            JSON.stringify(event.ticketLimit) : 
            (event.ticketLimit || ''),
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

async function saveEventsToDatabase(events) {
    try {
        const operations = events.map(event => ({
            updateOne: {
                filter: { sourceId: event.sourceId },
                update: { $set: event },
                upsert: true
            }
        }));
        
        const result = await TicketmasterEvent.bulkWrite(operations);
        console.log(`💾 Database operation completed: ${result.upsertedCount} new, ${result.modifiedCount} updated`);
        
        return result;
    } catch (error) {
        console.error("❌ Error saving events to database:", error.message);
        throw error;
    }
}

// Original processAllCities function (preserved)
async function processAllCities(cities, countryCode) {
    let totalEvents = 0;
    
    for (const city of cities) {
        try {
            console.log(`\n🇨🇦 Processing ${city}...`);
            const events = await fetchTransformAndSaveEventsForCity(city, countryCode);
            totalEvents += events.length;
            console.log(`✅ ${city} completed: ${events.length} events`);
            
            // Small delay between cities
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error(`❌ Failed to process ${city}:`, error.message);
            // Continue with next city
        }
    }
    
    return { totalEvents };
}

// Start the worker
if (require.main === module) {
    main().catch(error => {
        console.error("🚨 Fatal error:", error);
        process.exit(1);
    });
}

module.exports = {
    main,
    fetchTransformAndSaveEventsForCity,
    processAllCities,
    processDynamicCityRequests
};
