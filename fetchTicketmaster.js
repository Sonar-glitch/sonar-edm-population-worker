const mongoose = require("mongoose");
const axios = require("axios");
// REMOVED: const { connectToDatabase } = require("./lib/mongodb"); // This path was incorrect for worker
const UnifiedEvent = require("./models/UnifiedEvent");
const { processUnifiedEvents } = require("./processUnifiedEvents");
const { getPendingCityRequests, markCityAsProcessing, markCityAsCompleted, markCityAsError } = require("./lib/cityRequestQueue");

const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const FRONTEND_APP_URL = process.env.FRONTEND_APP_URL;

// --- START FIX: Improved Rate Limiting & Cache Invalidation ---
const RATE_LIMIT_DELAY_MS = 10000; // INCREASED: 10 seconds between requests (was 5)
const MAX_PAGES_PER_CITY = 3;      // REDUCED: 3 pages per city (was 5) to minimize API calls
const MAX_RETRY_ATTEMPTS = 3;      // NEW: Maximum retry attempts per city
const BASE_BACKOFF_MS = 60000;     // NEW: Base backoff 1 minute
const MAX_BACKOFF_MS = 900000;     // NEW: Max backoff 15 minutes

async function clearFrontendCache(city) {
    if (!FRONTEND_APP_URL) {
        console.warn("FRONTEND_APP_URL not set. Cannot clear frontend cache.");
        return;
    }
    try {
        console.log(`Attempting to clear frontend cache for ${city}...`);
        // Note: This assumes the frontend API /api/cache/clear expects a POST request with no body
        await axios.post(`${FRONTEND_APP_URL}/api/cache/clear`);
        console.log(`✅ Frontend cache for ${city} cleared successfully.`);
    } catch (cacheError) {
        console.error(`Error clearing frontend cache for ${city}:`, cacheError.message);
    }
}
// --- END FIX ---

async function rateLimitDelay(ms) {
    console.log(`⏳ Waiting ${Math.round(ms/1000)} seconds before next request...`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

// NEW: Calculate exponential backoff delay
function calculateBackoffDelay(attemptNumber) {
    const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, attemptNumber - 1), MAX_BACKOFF_MS);
    return delay;
}

async function fetchEventsForCity(cityRequest) {
    if (!cityRequest || !cityRequest.city) {
        console.error("Invalid city request provided.");
        return false;
    }

    console.log(`🎫 Fetching Ticketmaster events for ${cityRequest.city}, ${cityRequest.country}...`);

    const countryNameToCode = {
        'United Kingdom': 'GB',
        'United States': 'US',
        'Canada': 'CA'
    };
    const countryCode = countryNameToCode[cityRequest.country] || 'US';

    let allRawEvents = [];
    let page = 0;
    let hasMorePages = true;
    let retryAttempt = 0; // NEW: Track retry attempts

    while (hasMorePages && page < MAX_PAGES_PER_CITY && retryAttempt < MAX_RETRY_ATTEMPTS) {
        const url = `https://app.ticketmaster.com/discovery/v2/events.json?classificationName=Music&city=${encodeURIComponent(cityRequest.city )}&countryCode=${countryCode}&size=200&page=${page}&apikey=${TICKETMASTER_API_KEY}`;
        try {
            console.log(`📄 Fetching page ${page + 1} for ${cityRequest.city} (attempt ${retryAttempt + 1})...`);
            const response = await axios.get(url);
            const rawEvents = response.data._embedded?.events || [];
            console.log(`📥 Fetched ${rawEvents.length} raw events from Ticketmaster on page ${page + 1}`);

            if (rawEvents.length > 0) {
                allRawEvents.push(...rawEvents);
            }

            // Reset retry attempt on successful request
            retryAttempt = 0;

            if (!response.data._links.next) {
                hasMorePages = false;
            } else {
                page++;
                await rateLimitDelay(RATE_LIMIT_DELAY_MS);
            }
        } catch (error) {
            if (error.response && error.response.status === 429) {
                retryAttempt++;
                const backoffDelay = calculateBackoffDelay(retryAttempt);
                
                console.warn(`⏳ Rate limited for ${cityRequest.city} (attempt ${retryAttempt}/${MAX_RETRY_ATTEMPTS}). Backing off for ${Math.round(backoffDelay/60000)} minutes...`);
                
                if (retryAttempt >= MAX_RETRY_ATTEMPTS) {
                    console.error(`❌ Max retry attempts reached for ${cityRequest.city}. Skipping this city.`);
                    await markCityAsError(cityRequest.city, cityRequest.country, `Rate limited after ${MAX_RETRY_ATTEMPTS} attempts`);
                    return false;
                }
                
                await rateLimitDelay(backoffDelay);
                // Don't increment page, retry the same page
            } else {
                const errorMsg = error.response ? `${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message;
                console.error(`Error fetching from Ticketmaster for ${cityRequest.city}: ${errorMsg}`);
                await markCityAsError(cityRequest.city, cityRequest.country, `Ticketmaster fetch failed: ${errorMsg}`);
                hasMorePages = false;
                return false; // Indicate failure to main loop
            }
        }
    }

    if (allRawEvents.length > 0) {
        try {
            const transformedEvents = allRawEvents.map(event => ({
    source: "ticketmaster",
    sourceId: event.id,
    name: event.name,
    url: event.url,
    images: event.images,
    genre: event.classifications?.[0]?.genre?.name,
    subGenre: event.classifications?.[0]?.subGenre?.name,
    saleStartDate: event.sales?.public?.startDateTime,
    saleEndDate: event.sales?.public?.endDateTime,
    status: event.dates?.status?.code,
    raw: event,
    
    // SURGICAL ADDITION: Extract venue data for geographic filtering
    venue: {
        name: event._embedded?.venues?.[0]?.name || null,
        address: event._embedded?.venues?.[0]?.address?.line1 || null,
        city: event._embedded?.venues?.[0]?.city?.name || null,
        state: event._embedded?.venues?.[0]?.state?.name || null,
        country: event._embedded?.venues?.[0]?.country?.name || null,
        postalCode: event._embedded?.venues?.[0]?.postalCode || null
    },
    
    // Extract date/time for proper sorting
    date: event.dates?.start?.localDate ? new Date(event.dates.start.localDate) : null,
    startTime: event.dates?.start?.localTime || null,
    
    // Create location field for MongoDB geospatial queries (if coordinates available)
    location: event._embedded?.venues?.[0]?.location ? {
        type: "Point",
        coordinates: [
            parseFloat(event._embedded.venues[0].location.longitude), 
            parseFloat(event._embedded.venues[0].location.latitude)
        ]
    } : null
}));


            const bulkOps = transformedEvents.map(event => ({
    updateOne: {
        filter: { 
            source: event.source, 
            sourceId: event.sourceId 
        },
        update: { 
            $set: {
                ...event,
                lastUpdated: new Date()
            }
        },
        upsert: true
    }
}));

try {
    const bulkResult = await mongoose.connection.db.collection("events_ticketmaster").bulkWrite(bulkOps, {
        ordered: false // Continue processing even if some operations fail
    });
    
    console.log(`💾 Upserted ${transformedEvents.length} events to events_ticketmaster for ${cityRequest.city}`);
    console.log(`📊 Inserted: ${bulkResult.insertedCount}, Modified: ${bulkResult.modifiedCount}, Upserted: ${bulkResult.upsertedCount}`);
} catch (bulkError) {
    console.error(`❌ Bulk upsert failed for ${cityRequest.city}:`, bulkError.message);
    throw bulkError; // Re-throw to trigger existing error handling
}
            console.log(`💾 Saved ${transformedEvents.length} total events to MongoDB for ${cityRequest.city}`);

            await processUnifiedEvents({ source: "ticketmaster" });
        } catch (dbError) {
            console.error(`Error saving events to DB for ${cityRequest.city}:`, dbError.message);
            await markCityAsError(cityRequest.city, cityRequest.country, `DB save failed: ${dbError.message}`);
            return false;
        }
    } else {
        console.log(`ℹ️ No events found for ${cityRequest.city} after ${retryAttempt} retry attempts.`);
    }

    console.log(`✅ Finished processing ${cityRequest.city}: ${allRawEvents.length} total events fetched.`);
    return true; // Indicate success
}

async function processCanadianCities() {
    // This function can remain as is, assuming it's working for your needs.
    // If this function also fetches from Ticketmaster, it will need similar rate-limiting and cache invalidation logic.
    console.log("\n🇨🇦 PHASE 1: Processing Canadian Cities (This section is not modified by this fix)");
    // Original logic for Canadian cities would go here
}

async function processDynamicCities() {
    console.log("\n🌍 PHASE 2: Processing Dynamic City Queue");
    const pendingCities = await getPendingCityRequests();
    console.log(`Found ${pendingCities.length} pending cities in the queue.`);

    for (const city of pendingCities) {
        console.log(`\n--- Processing: ${city.city}, ${city.country} ---`);
        
        // SURGICAL FIX #1: Pass city.city and city.country instead of city._id
        await markCityAsProcessing(city.city, city.country);

        const success = await fetchEventsForCity(city);

        if (success) {
            // SURGICAL FIX #2: Pass city.city and city.country instead of city._id
            await markCityAsCompleted(city.city, city.country);
            console.log(`✅ Successfully completed ${city.city}, ${city.country}`);
        } else {
            // If fetchEventsForCity returned false (failed), it already marked as error
            console.log(`❌ Failed to process ${city.city}, ${city.country}`);
        }

        // --- RELOCATED CACHE INVALIDATION (Always runs after city processing attempt) ---
        await clearFrontendCache(city.city);
        
        // NEW: Add delay between cities to be respectful to the API
        if (pendingCities.indexOf(city) < pendingCities.length - 1) {
            console.log(`⏳ Waiting 30 seconds before processing next city...`);
            await rateLimitDelay(30000);
        }
    }
}

async function main() {
    console.log("🚀 Worker Starting...");
    console.log(`📊 Configuration: ${RATE_LIMIT_DELAY_MS/1000}s between requests, max ${MAX_PAGES_PER_CITY} pages per city, max ${MAX_RETRY_ATTEMPTS} retries`);
    
    // Corrected MongoDB connection for worker
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB Connected...");

    // We are focusing on the dynamic queue as it's the source of the issues.
    // If processCanadianCities is still active and uses Ticketmaster, it might need similar updates.
    // await processCanadianCities(); // Uncomment if you want to run Canadian cities processing

    await processDynamicCities();

    console.log("\n✅ Worker finished processing queue.");
    await mongoose.disconnect();
    console.log("MongoDB Disconnected.");
}

main().catch(err => {
    console.error("A critical error occurred in the main worker process:", err);
    process.exit(1);
});

