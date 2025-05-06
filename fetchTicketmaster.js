require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const Event = require("./models/Event"); // Import the Event model

const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

// List of major Canadian cities to query
const CANADIAN_CITIES = [
    "Toronto",
    "Montreal",
    "Vancouver",
    "Calgary",
    "Edmonton",
    "Ottawa",
    "Winnipeg",
    "Quebec City", // Added Quebec City
    "Hamilton",    // Added Hamilton
    "Mississauga"  // Added Mississauga
];

// --- Database Connection ---
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

// --- Transformation Logic ---

function transformEvent(rawEvent) {
    try {
        const venue = rawEvent._embedded?.venues?.[0];
        const classification = rawEvent.classifications?.[0];
        const priceRange = rawEvent.priceRanges?.[0];
        const artists = rawEvent._embedded?.attractions?.map(att => ({ name: att.name, id: att.id })) || [];
        const promoter = rawEvent.promoter ? { name: rawEvent.promoter.name, id: rawEvent.promoter.id } : undefined;

        let eventDate = null;
        if (rawEvent.dates?.start?.localDate) {
            const dateStr = rawEvent.dates.start.localDate;
            const timeStr = rawEvent.dates.start.localTime || "00:00:00";
            eventDate = new Date(`${dateStr}T${timeStr}`);
            if (isNaN(eventDate.getTime())) {
                console.warn(`Invalid date created for event ${rawEvent.id}: ${dateStr}T${timeStr}`);
                eventDate = null;
            }
        }
        if (!eventDate) {
             console.warn(`Missing or invalid date for event ${rawEvent.id}. Skipping event.`);
             return null;
        }

        const longitude = venue?.location?.longitude;
        const latitude = venue?.location?.latitude;
        if (!longitude || !latitude) {
            // Don't skip, but log that location might be less precise
            console.warn(`Missing precise location coordinates for event ${rawEvent.id}. Geolocation features might be affected.`);
            // We can still proceed if venue city/state is available
            if (!venue?.city?.name || !venue?.state?.stateCode) {
                console.warn(`Also missing city/state for event ${rawEvent.id}. Skipping event.`);
                return null;
            }
        }

        const image = rawEvent.images?.find(img => img.ratio === "16_9")?.url || rawEvent.images?.[0]?.url;

        const transformed = {
            name: rawEvent.name,
            date: eventDate,
            // Location is optional if coordinates are missing, but venue details should exist
            location: (longitude && latitude) ? {
                type: "Point",
                coordinates: [parseFloat(longitude), parseFloat(latitude)],
            } : undefined,
            venue: venue ? {
                name: venue.name,
                address: venue.address?.line1,
                city: venue.city?.name,
                state: venue.state?.stateCode || venue.state?.name,
                country: venue.country?.countryCode,
                postalCode: venue.postalCode,
            } : undefined,
            image: image,
            url: rawEvent.url,
            source: "Ticketmaster",
            sourceId: rawEvent.id,
            priceRange: priceRange ? {
                min: priceRange.min,
                max: priceRange.max,
                currency: priceRange.currency,
            } : undefined,
            characteristics: {
                genre: classification?.genre?.name ? [classification.genre.name] : [],
                subGenre: classification?.subGenre?.name ? [classification.subGenre.name] : [],
                type: classification?.type?.name,
            },
            artists: artists,
            promoter: promoter,
        };

        if (!transformed.name || !transformed.sourceId || !transformed.venue?.city) {
             console.warn(`Missing essential fields (name, sourceId, or venue city) for event ${rawEvent.id}. Skipping event.`);
             return null;
        }

        return transformed;
    } catch (error) {
        console.error(`Error transforming event ${rawEvent?.id}: ${error.message}`);
        return null;
    }
}

// --- Fetching Logic ---

async function fetchEventsPage(city, countryCode, page = 0, size = 200) {
    const params = {
        apikey: TICKETMASTER_API_KEY,
        classificationName: "Music",
        countryCode: countryCode,
        city: city,
        // geoPoint: geoPoint, // Using city/country instead
        // radius: 100, // Radius not applicable with city/country search
        // unit: "miles",
        sort: "date,asc",
        size: size, // Max allowed is 1000 for most searches, but keep 200 for safety
        page: page,
        // Consider adding startDateTime for future events only
        // startDateTime: new Date().toISOString().split(".")[0] + "Z",
    };

    try {
        console.log(`Fetching page ${page} for ${city}, ${countryCode}...`);
        const response = await axios.get(BASE_URL, { params });

        if (response.status === 200) {
            const events = response.data._embedded?.events || [];
            const pageInfo = response.data.page;
            console.log(`Page ${page} (${city}): Found ${events.length} events. Total elements: ${pageInfo.totalElements}, Total pages: ${pageInfo.totalPages}`);
            return {
                events: events,
                pageInfo: pageInfo,
            };
        } else {
            console.error(`Error fetching page ${page} (${city}): Status ${response.status}`);
            return null;
        }
    } catch (error) {
        if (error.response) {
            console.error(`Error fetching page ${page} (${city}): Status ${error.response.status} - ${error.response.data?.fault?.faultstring || error.message}`);
        } else if (error.request) {
            console.error(`Error fetching page ${page} (${city}): No response received`, error.request);
        } else {
            console.error(`Error fetching page ${page} (${city}): Request setup error`, error.message);
        }
        return null;
    }
}

// --- Main Processing Logic ---

async function fetchTransformAndSaveEventsForCity(city, countryCode) {
    let cityRawEvents = [];
    let currentPage = 0;
    let totalPages = 1;
    // Max pages per city (Ticketmaster limit is typically 5 pages / 1000 events for city search)
    const maxPagesPerCity = 5; 

    console.log(`Starting event fetch for city: ${city}, ${countryCode}`);

    while (currentPage < totalPages && currentPage < maxPagesPerCity) {
        const result = await fetchEventsPage(city, countryCode, currentPage);

        if (result && result.events.length > 0) {
            cityRawEvents = cityRawEvents.concat(result.events);
            // Ensure totalPages doesn't exceed maxPagesPerCity if TM reports more
            totalPages = Math.min(result.pageInfo.totalPages, maxPagesPerCity);
            currentPage++;
        } else {
            console.log(`Stopping fetch loop for ${city}. Reason: Error, no events found on page ${currentPage}, or page limit reached.`);
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit delay
    }
    console.log(`Finished fetching for ${city}. Raw events retrieved: ${cityRawEvents.length}`);
    return cityRawEvents;
}

async function processAllCities(cities, countryCode) {
    let allTransformedEvents = [];
    let totalRawCount = 0;

    for (const city of cities) {
        const rawEvents = await fetchTransformAndSaveEventsForCity(city, countryCode);
        totalRawCount += rawEvents.length;

        // Transform events for this city
        console.log(`Transforming ${rawEvents.length} events for ${city}...`);
        const transformed = rawEvents.map(transformEvent).filter(event => event !== null);
        allTransformedEvents = allTransformedEvents.concat(transformed);
        console.log(`Added ${transformed.length} valid transformed events from ${city}.`);
    }

    console.log(`Total raw events fetched across all cities: ${totalRawCount}`);
    console.log(`Total valid transformed events across all cities: ${allTransformedEvents.length}`);

    if (allTransformedEvents.length === 0) {
        console.log("No valid events to save. Exiting.");
        return;
    }

    // Save all events to MongoDB using bulk upsert
    console.log("Saving all events to MongoDB...");
    const bulkOps = allTransformedEvents.map(event => ({
        updateOne: {
            filter: { source: event.source, sourceId: event.sourceId },
            update: { $set: event },
            upsert: true,
        },
    }));

    try {
        const bulkResult = await Event.bulkWrite(bulkOps);
        console.log("Bulk write result:");
        console.log(`  Inserted: ${bulkResult.insertedCount}`);
        console.log(`  Matched: ${bulkResult.matchedCount}`);
        console.log(`  Modified: ${bulkResult.modifiedCount}`);
        console.log(`  Upserted: ${bulkResult.upsertedCount}`);
        console.log(`Successfully saved/updated ${allTransformedEvents.length} events in MongoDB.`);
    } catch (error) {
        console.error("Error during bulk write operation:", error.message);
    }
}

// --- Execution --- 
async function main() {
    const targetCountryCode = "CA"; // Target Canada
    const targetCities = CANADIAN_CITIES; // Use the defined list

    if (!TICKETMASTER_API_KEY) {
        console.error("Error: TICKETMASTER_API_KEY is not defined in .env file");
        process.exit(1);
    }

    await connectDB();

    try {
        await processAllCities(targetCities, targetCountryCode);
    } catch (error) {
        console.error(`An unexpected error occurred during the main process: ${error.message}`);
    } finally {
        await disconnectDB();
    }
}

main();

