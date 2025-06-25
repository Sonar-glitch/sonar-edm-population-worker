const axios = require("axios");
const mongoose = require("mongoose");
const TicketmasterEvent = require("./models/TicketmasterEvent");

// Import the city request queue utilities (NEW - but safe)
const { 
  getPendingCityRequests, 
  markCityAsProcessing, 
  markCityAsCompleted, 
  markCityAsError,
  cleanupOldRequests,
  getQueueStats
} = require("./lib/cityRequestQueue");

// PRESERVED: Original constants
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

// PRESERVED: Original Canadian cities (unchanged)
const CANADIAN_CITIES = [
    "Toronto", "Montreal", "Vancouver", "Calgary", 
    "Edmonton", "Ottawa", "Winnipeg", "Quebec City", 
    "Hamilton", "Mississauga"
];

// PRESERVED: Original database connection functions
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

// ENHANCED: Main processing logic (preserves original + adds queue processing)
async function main() {
    console.log("🚀 Enhanced Ticketmaster Worker Starting...");
    console.log("📅 Timestamp:", new Date().toISOString());
    
    await connectDB();
    
    try {
        // NEW: Clean up old requests first (safe operation)
        try {
          cleanupOldRequests();
          const queueStats = getQueueStats();
          console.log("📊 Queue Statistics:", queueStats);
        } catch (queueError) {
          console.warn("⚠️ Queue operations failed (continuing with original functionality):", queueError.message);
        }
        
        // PHASE 1: PRESERVED - Process original Canadian cities (UNCHANGED)
        console.log("\n🇨🇦 PHASE 1: Processing Canadian Cities (Original Functionality)");
        const canadianResults = await processAllCities(CANADIAN_CITIES, 'CA');
        console.log(`✅ Canadian cities processed: ${canadianResults.totalEvents} events`);
        
        // PHASE 2: NEW - Process dynamic city requests (SAFE - only if queue exists)
        console.log("\n🌍 PHASE 2: Processing Dynamic City Requests (New Feature)");
        let dynamicResults = { totalEvents: 0, citiesProcessed: 0 };
        
        try {
          dynamicResults = await processDynamicCityRequests();
          console.log(`✅ Dynamic cities processed: ${dynamicResults.totalEvents} events`);
        } catch (queueError) {
          console.warn("⚠️ Dynamic city processing failed (original functionality preserved):", queueError.message);
        }
        
        // PHASE 3: Summary
        const totalEvents = canadianResults.totalEvents + dynamicResults.totalEvents;
        console.log(`\n🎯 WORKER COMPLETED SUCCESSFULLY`);
        console.log(`📊 Total events processed: ${totalEvents}`);
        console.log(`🇨🇦 Canadian events: ${canadianResults.totalEvents}`);
        console.log(`🌍 Dynamic city events: ${dynamicResults.totalEvents}`);
        console.log(`⏱️ Processing time: ${new Date().toISOString()}`);
        
    } catch (error) {
        console.error("🚨 Worker failed:", error);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

// NEW: Process Dynamic City Requests (SAFE - with error handling)
async function processDynamicCityRequests() {
    try {
        const pendingRequests = await getPendingCityRequests();
        
        if (pendingRequests.length === 0) {
            console.log("📭 No pending city requests to process");
            return { totalEvents: 0, citiesProcessed: 0 };
        }
        
        console.log(`📋 Processing ${pendingRequests.length} pending city requests:`);
        pendingRequests.forEach((req, index) => {
            console.log(`   ${index + 1}. ${req.city}, ${req.country} (${req.countryCode}) - Priority: ${req.priority}`);
        });
        
        let totalEvents = 0;
        let citiesProcessed = 0;
        
        for (const cityRequest of pendingRequests) {
            try {
                console.log(`\n🔄 Processing: ${cityRequest.city}, ${cityRequest.country}`);
                
                // Mark as processing
                markCityAsProcessing(cityRequest.city, cityRequest.country);
                
                // Process the city using existing function
                const cityEvents = await fetchTransformAndSaveEventsForCity(
                    cityRequest.city, 
                    cityRequest.countryCode
                );
                
                console.log(`✅ ${cityRequest.city}: ${cityEvents.length} events processed`);
                
                // Mark as completed
                markCityAsCompleted(cityRequest.city, cityRequest.country, cityEvents.length);
                
                totalEvents += cityEvents.length;
                citiesProcessed++;
                
                // Rate limiting between cities
                if (citiesProcessed < pendingRequests.length) {
                    console.log("⏳ Rate limiting delay (5 seconds)...");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                
            } catch (error) {
                console.error(`❌ Failed to process ${cityRequest.city}, ${cityRequest.country}:`, error.message);
                
                // Mark as error
                markCityAsError(cityRequest.city, cityRequest.country, error.message);
            }
        }
        
        return { totalEvents, citiesProcessed };
        
    } catch (error) {
        console.error("❌ Error in dynamic city processing:", error);
        return { totalEvents: 0, citiesProcessed: 0 };
    }
}

// PRESERVED: Original processAllCities function (UNCHANGED)
async function processAllCities(cities, countryCode) {
    let allTransformedEvents = [];
    let totalRawCount = 0;

    console.log(`🏙️ Processing ${cities.length} cities for country: ${countryCode}`);

    for (const city of cities) {
        try {
            const rawEvents = await fetchTransformAndSaveEventsForCity(city, countryCode);
            
            if (rawEvents && rawEvents.length > 0) {
                allTransformedEvents = allTransformedEvents.concat(rawEvents);
                totalRawCount += rawEvents.length;
                console.log(`✅ ${city}: ${rawEvents.length} events`);
            } else {
                console.log(`📭 ${city}: No events found`);
            }
            
            // Rate limiting between cities
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`❌ Error processing ${city}:`, error.message);
        }
    }

    console.log(`🎯 Country ${countryCode} Summary:`);
    console.log(`   📊 Total raw events: ${totalRawCount}`);
    console.log(`   🏙️ Cities processed: ${cities.length}`);

    return { 
        totalEvents: totalRawCount, 
        citiesProcessed: cities.length,
        events: allTransformedEvents 
    };
}

// PRESERVED: Original fetchTransformAndSaveEventsForCity function (UNCHANGED)
async function fetchTransformAndSaveEventsForCity(city, countryCode) {
    let cityRawEvents = [];
    let currentPage = 0;
    let totalPages = 1;
    const maxPagesPerCity = 5;

    console.log(`🔍 Starting event fetch for city: ${city}, ${countryCode}`);

    while (currentPage < totalPages && currentPage < maxPagesPerCity) {
        const result = await fetchEventsPage(city, countryCode, currentPage);

        if (result && result.events.length > 0) {
            cityRawEvents = cityRawEvents.concat(result.events);
            totalPages = Math.min(result.pageInfo.totalPages, maxPagesPerCity);
            currentPage++;
        } else {
            console.log(`⏹️ Stopping fetch loop for ${city}. Reason: Error, no events found on page ${currentPage}, or page limit reached.`);
            break;
        }
        
        // Rate limiting between API calls
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`📥 Finished fetching for ${city}. Raw events retrieved: ${cityRawEvents.length}`);
    
    // Transform and save events
    if (cityRawEvents.length > 0) {
        const transformedEvents = cityRawEvents.map(event => transformEvent(event));
        const validEvents = transformedEvents.filter(event => event !== null);
        
        if (validEvents.length > 0) {
            await saveEventsToDatabase(validEvents);
            console.log(`💾 Saved ${validEvents.length} events for ${city}`);
        }
        
        return validEvents;
    }
    
    return [];
}

// PRESERVED: Original fetchEventsPage function (UNCHANGED)
async function fetchEventsPage(city, countryCode, page = 0, size = 200) {
    const params = {
        apikey: TICKETMASTER_API_KEY,
        classificationName: "Music", // MUSIC EVENTS ONLY (PRESERVED)
        countryCode: countryCode,
        city: city,
        sort: "date,asc",
        size: size,
        page: page,
    };

    try {
        console.log(`📡 Fetching page ${page} for ${city}, ${countryCode}...`);
        const response = await axios.get(BASE_URL, { params });

        if (response.status === 200) {
            const events = response.data._embedded?.events || [];
            const pageInfo = response.data.page;
            console.log(`📄 Page ${page} (${city}): Found ${events.length} events. Total elements: ${pageInfo.totalElements}, Total pages: ${pageInfo.totalPages}`);
            return {
                events: events,
                pageInfo: pageInfo,
            };
        } else {
            console.error(`❌ Error fetching page ${page} (${city}): Status ${response.status}`);
            return null;
        }
    } catch (error) {
        if (error.response) {
            console.error(`❌ Error fetching page ${page} (${city}): Status ${error.response.status} - ${error.response.data?.fault?.faultstring || error.message}`);
        } else if (error.request) {
            console.error(`❌ Error fetching page ${page} (${city}): No response received`);
        } else {
            console.error(`❌ Error fetching page ${page} (${city}): Request setup error`, error.message);
        }
        return null;
    }
}

// PRESERVED: Original transformEvent function (UNCHANGED - maintains source labeling)
function transformEvent(rawEvent) {
    try {
        const eventId = rawEvent.id;
        const venue = rawEvent._embedded?.venues?.[0];
        
        if (!eventId) {
            console.warn("Missing event ID. Skipping event.");
            return null;
        }
        
        // Extract date and time information
        let eventDate = null;
        let startTime = null;
        let endTime = null;
        let doorTime = null;
        
        if (rawEvent.dates?.start?.localDate) {
            const dateStr = rawEvent.dates.start.localDate;
            const timeStr = rawEvent.dates.start.localTime || "00:00:00";
            eventDate = new Date(`${dateStr}T${timeStr}`);
            startTime = rawEvent.dates.start.localTime;
            
            if (rawEvent.dates.end?.localTime) {
                endTime = rawEvent.dates.end.localTime;
            }
            
            if (rawEvent.dates.access?.localTime) {
                doorTime = rawEvent.dates.access.localTime;
            }
        }
        
        if (!eventDate) {
            console.warn(`Missing or invalid date for event ${eventId}. Skipping event.`);
            return null;
        }
        
        // Extract location coordinates
        const longitude = venue?.location?.longitude;
        const latitude = venue?.location?.latitude;
        const locationObj = (longitude && latitude) ? {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
        } : undefined;
        
        if (!locationObj) {
            console.warn(`Missing precise location coordinates for event ${eventId}. Geolocation features might be affected.`);
            if (!venue?.city?.name || !venue?.state?.stateCode) {
                console.warn(`Also missing city/state for event ${eventId}. Skipping event.`);
                return null;
            }
        }
        
        // Extract images
        const images = rawEvent.images?.map(img => ({
            url: img.url,
            ratio: img.ratio,
            width: img.width,
            height: img.height,
            fallback: img.fallback || false
        })) || [];
        
        const primaryImage = rawEvent.images?.find(img => img.ratio === "16_9")?.url || 
                            rawEvent.images?.[0]?.url;
        
        // Extract price information
        const priceRanges = rawEvent.priceRanges?.map(pr => ({
            type: pr.type,
            currency: pr.currency,
            min: pr.min,
            max: pr.max
        })) || [];
        
        // Extract classifications and genres
        const classifications = rawEvent.classifications?.map(cls => ({
            primary: cls.primary,
            segment: cls.segment ? {
                id: cls.segment.id,
                name: cls.segment.name
            } : undefined,
            genre: cls.genre ? {
                id: cls.genre.id,
                name: cls.genre.name
            } : undefined,
            subGenre: cls.subGenre ? {
                id: cls.subGenre.id,
                name: cls.subGenre.name
            } : undefined,
            type: cls.type ? {
                id: cls.type.id,
                name: cls.type.name
            } : undefined,
            subType: cls.subType ? {
                id: cls.subType.id,
                name: cls.subType.name
            } : undefined
        })) || [];
        
        // Create a flattened genres array from all classifications
        const genresSet = new Set();
        classifications.forEach(cls => {
            if (cls.genre?.name) genresSet.add(cls.genre.name);
            if (cls.subGenre?.name) genresSet.add(cls.subGenre.name);
        });
        const genres = Array.from(genresSet);
        
        // Extract artists/attractions
        const attractions = rawEvent._embedded?.attractions?.map(att => ({
            id: att.id,
            name: att.name,
            type: att.type,
            url: att.url,
            images: att.images?.map(img => ({ url: img.url, ratio: img.ratio })) || [],
            genres: att.classifications?.map(cls => cls.genre?.name).filter(Boolean) || [],
            externalLinks: att.externalLinks
        })) || [];
        
        // Create initial sound characteristics based on genre
        const characteristicsObj = {
            melody: 50,
            danceability: 50,
            energy: 50,
            tempo: 50,
            obscurity: 50
        };
        
        // Simple genre-based adjustments
        if (genres.some(g => g.toLowerCase().includes('electronic') || g.toLowerCase().includes('edm'))) {
            characteristicsObj.danceability = 85;
            characteristicsObj.energy = 80;
            characteristicsObj.tempo = 75;
        } else if (genres.some(g => g.toLowerCase().includes('rock'))) {
            characteristicsObj.energy = 85;
            characteristicsObj.tempo = 70;
        } else if (genres.some(g => g.toLowerCase().includes('jazz'))) {
            characteristicsObj.melody = 80;
            characteristicsObj.obscurity = 70;
        } else if (genres.some(g => g.toLowerCase().includes('classical'))) {
            characteristicsObj.melody = 90;
            characteristicsObj.obscurity = 60;
        }
        
        // Build the final event object
        const transformedEvent = {
            sourceId: eventId,
            source: "ticketmaster", // CRITICAL: Preserve source labeling (the fix you spent hours on!)
            name: rawEvent.name,
            description: rawEvent.info,
            url: rawEvent.url,
            date: eventDate,
            startTime: startTime,
            endTime: endTime,
            doorTime: doorTime,
            status: rawEvent.dates?.status?.code || "active",
            venue: venue ? {
                name: venue.name,
                address: venue.address?.line1,
                city: venue.city?.name,
                state: venue.state?.name,
                stateCode: venue.state?.stateCode,
                country: venue.country?.name,
                countryCode: venue.country?.countryCode,
                postalCode: venue.postalCode,
                location: locationObj,
                type: venue.type,
                url: venue.url
            } : undefined,
            location: locationObj,
            images: images,
            primaryImage: primaryImage,
            priceRanges: priceRanges,
            classifications: classifications,
            genres: genres,
            attractions: attractions,
            soundCharacteristics: characteristicsObj,
            ticketLimit: rawEvent.ticketLimit,
            ageRestrictions: rawEvent.ageRestrictions,
            accessibility: rawEvent.accessibility,
            pleaseNote: rawEvent.pleaseNote,
            seatmap: rawEvent.seatmap?.staticUrl,
            sales: rawEvent.sales,
            promoter: rawEvent.promoter,
            rawData: rawEvent // Keep original for debugging
        };
        
        return transformedEvent;
        
    } catch (error) {
        console.error("Error transforming event:", error);
        return null;
    }
}

// PRESERVED: Original saveEventsToDatabase function (UNCHANGED)
async function saveEventsToDatabase(events) {
    try {
        const operations = events.map(event => ({
            updateOne: {
                filter: { sourceId: event.sourceId, source: event.source },
                update: { $set: event },
                upsert: true
            }
        }));
        
        const result = await TicketmasterEvent.bulkWrite(operations);
        console.log(`💾 Database save result: ${result.upsertedCount} new, ${result.modifiedCount} updated`);
        
    } catch (error) {
        console.error("❌ Error saving events to database:", error);
        throw error;
    }
}

// Run the enhanced worker
if (require.main === module) {
    main().catch(error => {
        console.error("🚨 Fatal error:", error);
        process.exit(1);
    });
}

module.exports = {
    main,
    fetchTransformAndSaveEventsForCity,
    processDynamicCityRequests
};

