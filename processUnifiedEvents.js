require("dotenv").config();
const mongoose = require("mongoose");

// Import models
const TicketmasterEvent = require("./models/TicketmasterEvent");
const UnifiedEvent = require("./models/UnifiedEvent");

// Import validation and processing functions
const { 
  validateAndNormalizeEvent, 
  mergeAndDeduplicateEvents, 
  calculateCompletenessScore 
} = require("./lib/eventValidation");

const MONGODB_URI = process.env.MONGODB_URI;

// --- Database Connection ---
async function connectDB() {
    if (!MONGODB_URI) {
        console.error("Error: MONGODB_URI is not defined in .env file");
        process.exit(1);
    }
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("MongoDB Connected for unified processing...");
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

// --- Unified Processing Logic ---

async function fetchSourceEvents() {
    console.log("🔍 Fetching events from source collections...");
    
    const sourceEvents = {
        ticketmaster: [],
        // Future sources will be added here
        // edmtrain: [],
        // spotify: [],
        // manual: []
    };
    
    try {
        // Fetch Ticketmaster events
        console.log("📥 Fetching Ticketmaster events...");
        const ticketmasterEvents = await TicketmasterEvent.find({}).lean();
        sourceEvents.ticketmaster = ticketmasterEvents.map(event => ({
            ...event,
            _sourceCollection: 'events_ticketmaster'
        }));
        console.log(`✅ Found ${sourceEvents.ticketmaster.length} Ticketmaster events`);
        
        // TODO: Add other sources here as they become available
        // const edmtrainEvents = await EDMTrainEvent.find({}).lean();
        // sourceEvents.edmtrain = edmtrainEvents.map(event => ({
        //     ...event,
        //     _sourceCollection: 'events_edmtrain'
        // }));
        
    } catch (error) {
        console.error("❌ Error fetching source events:", error.message);
        throw error;
    }
    
    return sourceEvents;
}

async function processAndValidateEvents(sourceEvents) {
    console.log("🔄 Processing and validating events...");
    
    const allEvents = [];
    let totalProcessed = 0;
    let totalValid = 0;
    
    // Process each source
    for (const [sourceName, events] of Object.entries(sourceEvents)) {
        if (events.length === 0) continue;
        
        console.log(`📋 Processing ${events.length} events from ${sourceName}...`);
        
        for (const event of events) {
            try {
                // Validate and normalize the event
                const validatedEvent = validateAndNormalizeEvent(event, sourceName);
                
                if (validatedEvent) {
                    // Calculate quality score
                    const qualityScore = calculateCompletenessScore(validatedEvent);
                    
                    // Add unified processing metadata
                    validatedEvent.unifiedProcessing = {
                        processedAt: new Date(),
                        processingVersion: '1.0.0',
                        qualityScore: qualityScore,
                        isDeduplicated: false,
                        sourceEvents: [{
                            source: validatedEvent.source,
                            sourceId: event.sourceId,
                            collection: event._sourceCollection
                        }]
                    };
                    
                    allEvents.push(validatedEvent);
                    totalValid++;
                }
                totalProcessed++;
            } catch (error) {
                console.warn(`⚠️ Failed to process event ${event.sourceId} from ${sourceName}:`, error.message);
                totalProcessed++;
            }
        }
        
        console.log(`✅ Processed ${events.length} events from ${sourceName}, ${totalValid} valid`);
    }
    
    console.log(`📊 Total processed: ${totalProcessed}, Total valid: ${totalValid}`);
    return allEvents;
}

async function deduplicateEvents(events) {
    console.log("🔍 Deduplicating events...");
    
    const startCount = events.length;
    
    // Use the mergeAndDeduplicateEvents function from eventValidation.js
    const deduplicatedEvents = mergeAndDeduplicateEvents(events);
    
    const endCount = deduplicatedEvents.length;
    const duplicatesRemoved = startCount - endCount;
    
    console.log(`📊 Deduplication complete: ${startCount} → ${endCount} events (${duplicatesRemoved} duplicates removed)`);
    
    // Mark deduplicated events
    deduplicatedEvents.forEach(event => {
        if (event.unifiedProcessing) {
            event.unifiedProcessing.isDeduplicated = duplicatesRemoved > 0;
        }
    });
    
    return deduplicatedEvents;
}

async function saveUnifiedEvents(events) {
    console.log("💾 Saving unified events to database...");
    
    if (events.length === 0) {
        console.log("⚠️ No events to save");
        return { saved: 0, updated: 0, errors: 0 };
    }
    
    const bulkOps = events.map(event => ({
        updateOne: {
            filter: { 
                source: event.source, 
                sourceId: event.sourceId 
            },
            update: { $set: event },
            upsert: true,
        },
    }));
    
    try {
        const bulkResult = await UnifiedEvent.bulkWrite(bulkOps);
        
        console.log("📊 Unified events save result:");
        console.log(`  Inserted: ${bulkResult.insertedCount}`);
        console.log(`  Matched: ${bulkResult.matchedCount}`);
        console.log(`  Modified: ${bulkResult.modifiedCount}`);
        console.log(`  Upserted: ${bulkResult.upsertedCount}`);
        console.log(`✅ Successfully saved/updated ${events.length} events in events_unified collection`);
        
        return {
            saved: bulkResult.insertedCount + bulkResult.upsertedCount,
            updated: bulkResult.modifiedCount,
            errors: 0
        };
    } catch (error) {
        console.error("❌ Error during unified events bulk write:", error.message);
        return { saved: 0, updated: 0, errors: events.length };
    }
}

async function cleanupOldEvents() {
    console.log("🧹 Cleaning up old events...");
    
    try {
        // Remove events that are more than 30 days in the past
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        
        const deleteResult = await UnifiedEvent.deleteMany({
            date: { $lt: cutoffDate }
        });
        
        console.log(`🗑️ Removed ${deleteResult.deletedCount} old events (older than 30 days)`);
        return deleteResult.deletedCount;
    } catch (error) {
        console.error("❌ Error during cleanup:", error.message);
        return 0;
    }
}

async function generateProcessingReport(stats) {
    console.log("\n📋 UNIFIED PROCESSING REPORT");
    console.log("============================");
    console.log(`🕐 Processing completed at: ${new Date().toISOString()}`);
    console.log(`📊 Events processed: ${stats.totalProcessed || 0}`);
    console.log(`✅ Events validated: ${stats.totalValid || 0}`);
    console.log(`🔄 Events deduplicated: ${stats.duplicatesRemoved || 0}`);
    console.log(`💾 Events saved: ${stats.saved || 0}`);
    console.log(`🔄 Events updated: ${stats.updated || 0}`);
    console.log(`❌ Processing errors: ${stats.errors || 0}`);
    console.log(`🧹 Old events cleaned: ${stats.cleaned || 0}`);
    console.log("============================\n");
    
    // Calculate success rate
    const successRate = stats.totalProcessed > 0 ? 
        ((stats.totalValid / stats.totalProcessed) * 100).toFixed(1) : 0;
    console.log(`📈 Processing success rate: ${successRate}%`);
    
    return {
        timestamp: new Date().toISOString(),
        ...stats,
        successRate: parseFloat(successRate)
    };
}

// --- Main Processing Function ---

async function processUnifiedEvents() {
    console.log("🚀 Starting unified event processing pipeline...");
    
    const stats = {
        totalProcessed: 0,
        totalValid: 0,
        duplicatesRemoved: 0,
        saved: 0,
        updated: 0,
        errors: 0,
        cleaned: 0
    };
    
    try {
        // Step 1: Fetch events from all source collections
        const sourceEvents = await fetchSourceEvents();
        
        // Step 2: Process and validate events
        const validatedEvents = await processAndValidateEvents(sourceEvents);
        stats.totalProcessed = Object.values(sourceEvents).reduce((sum, events) => sum + events.length, 0);
        stats.totalValid = validatedEvents.length;
        
        // Step 3: Deduplicate events across sources
        const deduplicatedEvents = await deduplicateEvents(validatedEvents);
        stats.duplicatesRemoved = validatedEvents.length - deduplicatedEvents.length;
        
        // Step 4: Save to unified collection
        const saveResult = await saveUnifiedEvents(deduplicatedEvents);
        stats.saved = saveResult.saved;
        stats.updated = saveResult.updated;
        stats.errors = saveResult.errors;
        
        // Step 5: Cleanup old events
        stats.cleaned = await cleanupOldEvents();
        
        // Step 6: Generate report
        const report = await generateProcessingReport(stats);
        
        console.log("✅ Unified processing pipeline completed successfully!");
        return report;
        
    } catch (error) {
        console.error("❌ Unified processing pipeline failed:", error.message);
        stats.errors = stats.totalProcessed || 1;
        await generateProcessingReport(stats);
        throw error;
    }
}

// --- Execution ---
async function main() {
    await connectDB();
    
    try {
        const report = await processUnifiedEvents();
        console.log("🎯 Final processing report:", JSON.stringify(report, null, 2));
    } catch (error) {
        console.error(`❌ Unified processing failed: ${error.message}`);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { processUnifiedEvents, connectDB, disconnectDB };

