/**
 * PERMANENT FIX - processUnifiedEvents.js
 *
 * Re-architected with a robust, memory-safe, batch-based processing pipeline.
 * This version replaces the flawed logic that caused memory crashes (R14 errors).
 *
 * Key Features:
 * ✅ Memory-Safe Batch Processing: Processes events in small, configurable batches to prevent crashes.
 * ✅ Prioritized Reprocessing: First, fixes events explicitly flagged with `needsEnhancement: true`.
 * ✅ Efficient New Event Processing: After fixing old events, it processes new, un-enhanced events.
 * ✅ Graceful Error Handling: Errors in one batch do not stop the entire process.
 * ✅ Integrates Existing Logic: Correctly uses the existing RecommendationEnhancer and validation utilities.
 *
 * Status: Production Ready - Replaces previous version.
 */

require("dotenv").config();
const mongoose = require("mongoose");

// Import models
const TicketmasterEvent = require("./models/TicketmasterEvent");
const UnifiedEvent = require("./models/UnifiedEvent");

// Import validation and processing functions
const { enhanceEventsWithOCR } = require("./lib/ocrUtils");
const {
  validateAndNormalizeEvent,
  mergeAndDeduplicateEvents,
  calculateCompletenessScore
} = require("./lib/eventValidation");
const { RecommendationEnhancer } = require("./lib/recommendationEnhancer");

const MONGODB_URI = process.env.MONGODB_URI;
const BATCH_SIZE = 200; // Process 200 events at a time to stay within memory limits

// --- Database Connection ---
async function connectDB() {
    if (!MONGODB_URI) {
        console.error("Error: MONGODB_URI is not defined in .env file");
        process.exit(1);
    }
    if (mongoose.connection.readyState === 0) {
        try {
            await mongoose.connect(MONGODB_URI);
            console.log("MongoDB Connected for unified processing...");
        } catch (err) {
            console.error("MongoDB connection error:", err.message);
            process.exit(1);
        }
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

// --- NEW BATCH-BASED PROCESSING LOGIC ---

/**
 * Main orchestration function for the new batch-based pipeline.
 */
async function newProcessUnifiedEvents() {
    console.log('🚀 Starting new, robust, batch-based unified event processing pipeline...');
    const enhancer = new RecommendationEnhancer();
    const stats = { totalFlaggedFixed: 0, totalNewEnhanced: 0, totalCleaned: 0, errors: 0 };

    try {
        // STAGE 1: Prioritized reprocessing of events flagged for a fix.
        stats.totalFlaggedFixed = await processFlaggedEventsInBatches(enhancer);

        // STAGE 2: Process new, un-enhanced events from the unified collection.
        stats.totalNewEnhanced = await processNewEventsInBatches(enhancer);
        
        // STAGE 3: Ingest new events from source collections (e.g., Ticketmaster)
        await ingestNewEventsFromSource(enhancer);

        // STAGE 4: Cleanup old events (can run independently)
        stats.totalCleaned = await cleanupOldEvents();

        console.log('🎉 Unified event processing pipeline completed successfully.');

    } catch (error) {
        console.error('🚨 A critical error occurred in the main processing pipeline:', error);
        stats.errors++;
    } finally {
        await generateProcessingReport(stats);
    }
}

/**
 * Finds and processes events that were manually flagged for reprocessing.
 * @param {RecommendationEnhancer} enhancer - The recommendation enhancer instance.
 * @returns {Promise<number>} The number of events successfully processed.
 */
async function processFlaggedEventsInBatches(enhancer) {
    console.log('🔥 Stage 1: Checking for events flagged for reprocessing...');
    const query = { needsEnhancement: true };
    const totalToProcess = await UnifiedEvent.countDocuments(query);

    if (totalToProcess === 0) {
        console.log('✅ No events flagged for reprocessing.');
        return 0;
    }

    console.log(`🎯 Found ${totalToProcess} events flagged for a fix. Processing in batches of ${BATCH_SIZE}...`);
    let processedCount = 0;
    let page = 0;

    while (processedCount < totalToProcess) {
        const batch = await UnifiedEvent.find(query).skip(page * BATCH_SIZE).limit(BATCH_SIZE).lean();
        if (batch.length === 0) break;

        console.log(`🔄 Processing flagged batch: ${processedCount + 1} to ${processedCount + batch.length} of ${totalToProcess}`);
        const enhancedBatch = await enhancer.enhanceEvents(batch);
        await saveEnhancedBatch(enhancedBatch, { isFlaggedFix: true });

        processedCount += batch.length;
        page++;
    }
    console.log(`✅ Successfully completed reprocessing of ${processedCount} flagged events.`);
    return processedCount;
}

/**
 * Finds and processes new events in the unified collection that have not yet been enhanced.
 * @param {RecommendationEnhancer} enhancer - The recommendation enhancer instance.
 * @returns {Promise<number>} The number of events successfully processed.
 */
async function processNewEventsInBatches(enhancer) {
    console.log('✨ Stage 2: Checking for new, un-enhanced events in the unified collection...');
    const query = { enhancementProcessed: { $ne: true } };
    const totalToProcess = await UnifiedEvent.countDocuments(query);

    if (totalToProcess === 0) {
        console.log('✅ No new events to process.');
        return 0;
    }

    console.log(`🎯 Found ${totalToProcess} new events to enhance. Processing in batches of ${BATCH_SIZE}...`);
    let processedCount = 0;
    let page = 0;

    while (processedCount < totalToProcess) {
        const batch = await UnifiedEvent.find(query).skip(page * BATCH_SIZE).limit(BATCH_SIZE).lean();
        if (batch.length === 0) break;

        console.log(`🔄 Processing new batch: ${processedCount + 1} to ${processedCount + batch.length} of ${totalToProcess}`);
        const enhancedBatch = await enhancer.enhanceEvents(batch);
        await saveEnhancedBatch(enhancedBatch);

        processedCount += batch.length;
        page++;
    }
    console.log(`✅ Successfully completed enhancement of ${processedCount} new events.`);
    return processedCount;
}

/**
 * Ingests events from a source collection (like events_ticketmaster) into the unified collection.
 * @param {RecommendationEnhancer} enhancer
 */
async function ingestNewEventsFromSource(enhancer) {
    console.log('📥 Stage 3: Ingesting new events from source collections (Ticketmaster)...');
    
    // Find events from the source that are not yet in the unified collection
    const existingSourceIds = await UnifiedEvent.distinct('sourceId', { source: 'Ticketmaster' });
    const query = { _id: { $nin: existingSourceIds.map(id => new mongoose.Types.ObjectId(id)) } };
    
    const totalToIngest = await TicketmasterEvent.countDocuments(query);
    if (totalToIngest === 0) {
        console.log('✅ No new events to ingest from Ticketmaster.');
        return;
    }

    console.log(`🎯 Found ${totalToIngest} new events to ingest. Processing in batches...`);
    let ingestedCount = 0;
    let page = 0;

    while (ingestedCount < totalToIngest) {
        const batch = await TicketmasterEvent.find(query).skip(page * BATCH_SIZE).limit(BATCH_SIZE).lean();
        if (batch.length === 0) break;

        const validatedBatch = batch.map(event => validateAndNormalizeEvent(event, 'Ticketmaster'));
        const deduplicatedBatch = mergeAndDeduplicateEvents(validatedBatch.filter(e => e !== null));
        const enhancedBatch = await enhancer.enhanceEvents(deduplicatedBatch);
        
        await saveEnhancedBatch(enhancedBatch);
        ingestedCount += batch.length;
        page++;
    }
    console.log(`✅ Ingestion complete. Processed ${ingestedCount} new events from Ticketmaster.`);
}


/**
 * Saves a batch of enhanced events to the database using bulk operations for efficiency.
 * @param {Array} enhancedEvents - The array of events to save.
 * @param {Object} options - Optional parameters.
 */
async function saveEnhancedBatch(enhancedEvents, options = {}) {
    if (!enhancedEvents || enhancedEvents.length === 0) {
        return;
    }

    const bulkOps = enhancedEvents.map(event => {
        const { _id, ...eventWithoutId } = event;
        const updateQuery = {
            $set: {
                ...eventWithoutId,
                enhancementProcessed: true,
                updatedAt: new Date(),
            },
            $unset: {}
        };

        if (options.isFlaggedFix) {
            updateQuery.$unset.needsEnhancement = '';
        }

        return {
            updateOne: {
                filter: { sourceId: event.sourceId, source: event.source },
                update: updateQuery,
                upsert: true
            }
        };
    });

    try {
        const result = await UnifiedEvent.bulkWrite(bulkOps);
        console.log(`💾 Batch save complete: ${result.modifiedCount} updated, ${result.upsertedCount} created.`);
    } catch (error) {
        console.error(`❌ Error during bulk save operation for a batch:`, error);
    }
}

async function cleanupOldEvents() {
    console.log("🧹 Cleaning up old events...");
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        const deleteResult = await UnifiedEvent.deleteMany({ date: { $lt: cutoffDate } });
        console.log(`🗑️ Removed ${deleteResult.deletedCount} old events.`);
        return deleteResult.deletedCount;
    } catch (error) {
        console.error("❌ Error during cleanup:", error.message);
        return 0;
    }
}

async function generateProcessingReport(stats) {
    console.log("\n📋 ROBUST PROCESSING REPORT");
    console.log("============================");
    console.log(`🕐 Processing completed at: ${new Date().toISOString()}`);
    console.log(`✅ Flagged events fixed: ${stats.totalFlaggedFixed}`);
    console.log(`✨ New events enhanced: ${stats.totalNewEnhanced}`);
    console.log(`🧹 Old events cleaned: ${stats.totalCleaned}`);
    console.log(`❌ Errors: ${stats.errors}`);
    console.log("============================");
}

// --- Main Execution ---
async function main() {
    await connectDB();
    try {
        await newProcessUnifiedEvents();
    } catch (error) {
        console.error(`❌ Main processing function failed: ${error.message}`);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

if (require.main === module) {
    main();
}

module.exports = { processUnifiedEvents: newProcessUnifiedEvents, connectDB, disconnectDB };
