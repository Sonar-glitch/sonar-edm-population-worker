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
        // Basic validation (keep existing validation logic)
        const eventId = rawEvent.id;
        if (!eventId) {
            console.warn(`Missing event ID. Skipping event.`);
            return null;
        }
        
        // Extract venue information (enhanced)
        const venue = rawEvent._embedded?.venues?.[0];
        const venueObj = venue ? {
            name: venue.name,
            address: venue.address?.line1,
            city: venue.city?.name,
            state: venue.state?.stateCode || venue.state?.name,
            country: venue.country?.countryCode,
            postalCode: venue.postalCode,
            type: venue.type,
            capacity: venue.capacity ? parseInt(venue.capacity) : undefined,
            url: venue.url
        } : undefined;
        
        // Extract date and time information (enhanced)
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
            // Don't skip, but log that location might be less precise
            console.warn(`Missing precise location coordinates for event ${eventId}. Geolocation features might be affected.`);
            // We can still proceed if venue city/state is available
            if (!venue?.city?.name || !venue?.state?.stateCode) {
                console.warn(`Also missing city/state for event ${eventId}. Skipping event.`);
                return null;
            }
        }
        
        // Extract images (enhanced)
        const images = rawEvent.images?.map(img => ({
            url: img.url,
            ratio: img.ratio,
            width: img.width,
            height: img.height,
            fallback: img.fallback || false
        })) || [];
        
        // Select primary image with preference for 16:9 ratio
        const primaryImage = rawEvent.images?.find(img => img.ratio === "16_9")?.url || 
                            rawEvent.images?.[0]?.url;
        
        // Extract price information (enhanced)
        const priceRanges = rawEvent.priceRanges;
        const priceRangeObj = priceRanges?.[0] ? {
            min: priceRanges[0].min,
            max: priceRanges[0].max,
            currency: priceRanges[0].currency
        } : undefined;
        
        // Format a price string for frontend display
        let priceString = "Price not available";
        if (priceRangeObj) {
            if (priceRangeObj.min === 0 && priceRangeObj.max === 0) {
                priceString = "Free";
            } else if (priceRangeObj.min === priceRangeObj.max) {
                priceString = `${priceRangeObj.currency} ${priceRangeObj.min}`;
            } else {
                priceString = `${priceRangeObj.currency} ${priceRangeObj.min} - ${priceRangeObj.max}`;
            }
        } else if (rawEvent.free === true) {
            priceString = "Free";
        } else {
            priceString = "Free or TBC";
        }
        
        // Extract classifications (enhanced)
        const classifications = rawEvent.classifications?.map(cls => ({
            primary: cls.primary || false,
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
        
        // Extract artist information (enhanced)
        const attractions = rawEvent._embedded?.attractions || [];
        const artists = attractions.map(att => ({
            name: att.name,
            id: att.id,
            url: att.url,
            image: att.images?.find(img => img.ratio === "16_9")?.url || att.images?.[0]?.url,
            genres: att.classifications?.map(cls => cls.genre?.name).filter(Boolean) || [],
            popularity: undefined, // To be populated from Spotify if available
            headliner: att.primary || false
        }));
        
        // Create a flattened artistList for frontend
        const artistList = artists.map(artist => artist.name);
        
        // Extract promoter information (enhanced)
        const promoterObj = rawEvent.promoter ? {
            id: rawEvent.promoter.id,
            name: rawEvent.promoter.name,
            description: rawEvent.promoter.description
        } : undefined;
        
        // Extract sales information (new)
        const salesObj = rawEvent.sales ? {
            public: rawEvent.sales.public ? {
                startDateTime: rawEvent.sales.public.startDateTime ? new Date(rawEvent.sales.public.startDateTime) : undefined,
                endDateTime: rawEvent.sales.public.endDateTime ? new Date(rawEvent.sales.public.endDateTime) : undefined,
                startTBD: rawEvent.sales.public.startTBD
            } : undefined,
            presales: rawEvent.sales.presales?.map(presale => ({
                name: presale.name,
                description: presale.description,
                startDateTime: presale.startDateTime ? new Date(presale.startDateTime) : undefined,
                endDateTime: presale.endDateTime ? new Date(presale.endDateTime) : undefined,
                url: presale.url
            })) || []
        } : undefined;
        
        // Extract accessibility information (new)
        const accessibilityObj = rawEvent.accessibility ? {
            info: rawEvent.accessibility.info,
            ticketLimit: rawEvent.accessibility.ticketLimit
        } : undefined;
        
        // Extract event status (new)
        const status = rawEvent.dates?.status?.code || "active";
        
        // Extract additional notes (new)
        const pleaseNote = rawEvent.pleaseNote;
        
        // Extract seatmap URL (new)
        const seatmap = rawEvent.seatmap?.staticUrl;
        
        // Create initial sound characteristics based on genre
        // This is a placeholder - in a real implementation, you would use more sophisticated
        // logic to derive these values from genre, artist data, or external sources
        const characteristicsObj = {
            // Start with default values
            melody: 50,
            danceability: 50,
            energy: 50,
            tempo: 50,
            obscurity: 50
        };
        
        // Simple genre-based adjustments (example logic)
        if (genres.some(g => g.toLowerCase().includes('electronic') || g.toLowerCase().includes('edm'))) {
            characteristicsObj.danceability = 85;
            characteristicsObj.energy = 80;
            characteristicsObj.tempo = 75;
        } else if (genres.some(g => g.toLowerCase().includes('rock'))) {
            characteristicsObj.energy = 75;
            characteristicsObj.danceability = 60;
        } else if (genres.some(g => g.toLowerCase().includes('jazz'))) {
            characteristicsObj.melody = 80;
            characteristicsObj.obscurity = 65;
        } else if (genres.some(g => g.toLowerCase().includes('classical'))) {
            characteristicsObj.melody = 90;
            characteristicsObj.danceability = 30;
        }
        
        // Assemble the complete transformed event object
        const transformed = {
            // Basic Event Information
            name: rawEvent.name,
            description: rawEvent.description,
            status: status,
            
            // Temporal Information
            date: eventDate,
            startTime: startTime,
            endTime: endTime,
            doorTime: doorTime,
            
            // Location Information
            venue: venueObj,
            location: locationObj,
            
            // Visual Assets
            images: images,
            primaryImage: primaryImage,
            image: primaryImage, // For backward compatibility
            
            // Pricing Information
            priceRange: priceRangeObj,
            price: priceString,
            ticketLimit: rawEvent.ticketLimit?.info,
            
            // Classification & Categorization
            genres: genres,
            classifications: classifications,
            
            // Artists & Performers
            artists: artists,
            artistList: artistList,
            
            // Promoter & Organizer
            promoter: promoterObj,
            
            // External Links & References
            url: rawEvent.url,
            seatmap: seatmap,
            pleaseNote: pleaseNote,
            
            // Accessibility Information
            accessibility: accessibilityObj,
            
            // Sales Information
            sales: salesObj,
            
            // Sound Characteristics
            characteristics: characteristicsObj,
            
            // Source Tracking
            source: "Ticketmaster",
            sourceId: rawEvent.id,
            
            // Metadata
            lastFetchedAt: new Date()
        };
        
        if (!transformed.name || !transformed.sourceId || !transformed.venue?.city) {
            console.warn(`Missing essential fields (name, sourceId, or venue city) for event ${eventId}. Skipping event.`);
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
