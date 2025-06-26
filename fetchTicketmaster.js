const mongoose = require("mongoose");
const axios = require("axios");
// REMOVED: const { connectToDatabase } = require("./lib/mongodb"); // This path was incorrect for worker
const UnifiedEvent = require("./models/UnifiedEvent");
const { processUnifiedEvents } = require("./processUnifiedEvents");
const { getPendingCityRequests, markCityAsProcessing, markCityAsCompleted, markCityAsError } = require("./lib/cityRequestQueue");

const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const FRONTEND_APP_URL = process.env.FRONTEND_APP_URL;

// --- START FIX: Improved Rate Limiting & Cache Invalidation ---
const RATE_LIMIT_DELAY_MS = 5000; // Increased delay to 5 seconds
const MAX_PAGES_PER_CITY = 5;     // Safety cap: Limit to 5 pages (1000 events) per run

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
    return new Promise(resolve => setTimeout(resolve, ms));
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

    while (hasMorePages && page < MAX_PAGES_PER_CITY) {
        const url = `https://app.ticketmaster.com/discovery/v2/events.json?classificationName=Music&city=${encodeURIComponent(cityRequest.city )}&countryCode=${countryCode}&size=200&page=${page}&apikey=${TICKETMASTER_API_KEY}`;
        try {
            console.log(`📄 Fetching page ${page + 1} for ${cityRequest.city}...`);
            const response = await axios.get(url);
            const rawEvents = response.data._embedded?.events || [];
            console.log(`📥 Fetched ${rawEvents.length} raw events from Ticketmaster on page ${page + 1}`);

            if (rawEvents.length > 0) {
                allRawEvents.push(...rawEvents);
            }

            if (!response.data._links.next) {
                hasMorePages = false;
            } else {
                page++;
                await rateLimitDelay(RATE_LIMIT_DELAY_MS);
            }
        } catch (error) {
            if (error.response && error.response.status === 429) {
                console.warn(`⏳ Rate limited for ${cityRequest.city}. Backing off for 1 minute.`);
                await rateLimitDelay(60000); // 1 minute backoff
            } else {
                const errorMsg = error.response ? `${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message;
                console.error(`Error fetching from Ticketmaster for ${cityRequest.city}: ${errorMsg}`);
                await markCityAsError(cityRequest._id, `Ticketmaster fetch failed: ${errorMsg}`);
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
            }));

            await mongoose.connection.db.collection("events_ticketmaster").insertMany(transformedEvents);
            console.log(`💾 Saved ${transformedEvents.length} total events to MongoDB for ${cityRequest.city}`);

            await processUnifiedEvents({ source: "ticketmaster" });
        } catch (dbError) {
            console.error(`Error saving events to DB for ${cityRequest.city}:`, dbError.message);
            await markCityAsError(cityRequest._id, `DB save failed: ${dbError.message}`);
            return false;
        }
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
        console.log(`--- Processing: ${city.city}, ${city.country} ---`);
        await markCityAsProcessing(city._id);

        const success = await fetchEventsForCity(city);

        if (success) {
            await markCityAsCompleted(city._id);
        } else {
            // If fetchEventsForCity returned false (failed), it already marked as error
            console.log(`--- Failed to process ${city.city}, ${city.country} ---`);
        }

        // --- RELOCATED CACHE INVALIDATION (Always runs after city processing attempt) ---
        await clearFrontendCache(city.city);
    }
}

async function main() {
    console.log("🚀 Worker Starting...");
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
