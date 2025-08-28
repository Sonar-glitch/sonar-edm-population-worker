/**
 * ENHANCED UNIFIED EVENT PROCESSING PIPELINE
 * 
 * Features:
 * - Enhanced semantic deduplication
 * - Architecture validation & auto-cleanup  
 * - Single source of truth enforcement
 * - Real-time deduplication during ingestion
 * 
 * Date: August 13, 2025
 * Status: Production Ready with Optimizations
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
    calculateCompletenessScore,
    cleanupOldEvents,
    validateUnifiedArchitecture
} = require("./lib/eventValidation");
const { buildArchitectureValidator } = require('./lib/architectureValidatorWrapper');
const RecommendationEnhancer = require("./lib/recommendationEnhancer");

const MONGODB_URI = process.env.MONGODB_URI;

// Architecture validation (wrapped safely)
const architectureValidator = buildArchitectureValidator(validateUnifiedArchitecture());

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
        console.error("MongoDB disconnection error:", err.message);
    }
}

// --- Event Processing Functions ---
async function processAndValidateEvents(eventSources) {
    console.log("🔍 Processing and validating events...");
    
    // Validate architecture compliance first (safe async wrapper)
    try {
        const compliant = await architectureValidator.isCompliant();
        if (!compliant) {
            console.warn("⚠️ Architecture validation failed. Auto-fixing...");
            await architectureValidator.autoFix();
        }
    } catch (err) {
        console.warn('Architecture validation check failed (fallback to continue):', err && err.message);
    }
    
    const validEvents = [];
    
    for (const [source, events] of Object.entries(eventSources)) {
        console.log(`📊 Processing ${events.length} events from ${source}...`);
        
        for (const event of events) {
            try {
                const validatedEvent = await validateAndNormalizeEvent(event, source);
                if (validatedEvent) {
                    validEvents.push(validatedEvent);
                }
            } catch (error) {
                console.error(`❌ Validation failed for event ${event.id || 'unknown'}:`, error.message);
            }
        }
    }
    
    console.log(`✅ Validated ${validEvents.length} events successfully.`);
    return validEvents;
}

async function deduplicateEvents(events) {
    console.log("🔍 Deduplicating events...");
    try {
        const deduplicated = await mergeAndDeduplicateEvents(events);
        const removed = events.length - deduplicated.length;
        if (removed > 0) {
            console.log(`🔄 Enhanced semantic deduplication complete: ${events.length} → ${deduplicated.length} events (${removed} duplicates removed)`);
        } else {
            console.log(`✅ No duplicates found in batch of ${events.length} events`);
        }
        return deduplicated;
    } catch (error) {
        console.error("❌ Deduplication failed:", error.message);
        return events;
    }
}

async function saveUnifiedEvents(events) {
    console.log(`💾 Saving ${events.length} events to events_unified...`);
    
    if (events.length === 0) {
        return { saved: 0, updated: 0, errors: 0, cleaned: 0 };
    }
    
    try {
        // Filter out events that don't have a stable dedupe key.
        // Prefer `eventKey` (canonical dedupe key). Fall back to `sourceId` when present.
        const validOps = [];
        let skipped = 0;

        for (const event of events) {
            const hasEventKey = event && (event.eventKey || (event.eventKey === 0));
            const hasSourceId = event && (event.sourceId || (event.sourceId === 0));

            if (!hasEventKey && !hasSourceId) {
                skipped++;
                console.warn(`⚠️ Skipping upsert: missing eventKey and sourceId for event (name:${event && event.name} id:${event && event.id})`);
                continue;
            }

            const filter = hasEventKey ? { eventKey: event.eventKey } : { sourceId: event.sourceId };

            validOps.push({
                updateOne: {
                    filter,
                    update: { $set: event },
                    upsert: true
                }
            });
        }

        if (validOps.length === 0) {
            console.log(`ℹ️ No valid events to upsert (skipped ${skipped} invalid events)`);
            return { saved: 0, updated: 0, errors: skipped, cleaned: 0 };
        }

        const result = await UnifiedEvent.bulkWrite(validOps, { ordered: false });
        
        // Auto-cleanup old events during save
        const cleanupCount = await cleanupOldEvents(UnifiedEvent);
        
        console.log(`✅ Bulk operation complete: ${result.upsertedCount} new, ${result.modifiedCount} updated (skipped ${typeof skipped !== 'undefined' ? skipped : 0} invalid events)`);
        if (cleanupCount > 0) {
            console.log(`🧹 Auto-cleanup: Removed ${cleanupCount} old events during save`);
        }
        
        return {
            saved: result.upsertedCount,
            updated: result.modifiedCount,
            errors: (result.writeErrors ? result.writeErrors.length : 0) + (skipped || 0),
            cleaned: cleanupCount
        };
    } catch (error) {
        console.error("❌ Error saving events:", error.message);
        return { saved: 0, updated: 0, errors: events.length, cleaned: 0 };
    }
}

async function generateProcessingReport(stats) {
    console.log("\n📋 UNIFIED PROCESSING REPORT");
    console.log("============================");
    console.log(`📊 Total Events Processed: ${stats.totalProcessed}`);
    console.log(`✅ Valid Events: ${stats.totalValid}`);
    console.log(`💾 Events Saved: ${stats.saved}`);
    console.log(`🔄 Events Updated: ${stats.updated}`);
    console.log(`🔍 Duplicates Removed: ${stats.duplicatesRemoved}`);
    console.log(`🧹 Old Events Cleaned: ${stats.cleaned}`);
    console.log(`❌ Errors: ${stats.errors}`);
    console.log("============================");
    
    // Architecture validation report
    try {
        const architectureStatus = await architectureValidator.getStatus();
        console.log(`🏗️ Architecture Status: ${architectureStatus.compliant ? '✅ Compliant' : '⚠️ Non-compliant'}`);
        console.log(`📍 Single Source of Truth: ${architectureStatus.singleSource ? '✅ events_unified' : '❌ Multiple sources'}`);
    } catch (err) {
        console.warn('Failed to get architecture status (continuing):', err && err.message);
    }
    console.log("============================\n");
}

// --- Main Processing Pipeline ---
async function processUnifiedEvents() {
    console.log("🚀 Starting ENHANCED unified event processing pipeline...");
    
    const stats = {
        totalProcessed: 0,
        totalValid: 0,
        saved: 0,
        updated: 0,
        duplicatesRemoved: 0,
        cleaned: 0,
        errors: 0
    };

    const enhancer = new RecommendationEnhancer();
    
    if (!enhancer || typeof enhancer.enhanceEvents !== 'function') {
        console.log("⚠️ Recommendation enhancement is disabled. Exiting.");
        return;
    }

    try {
        const BATCH_SIZE = 200;
        const query = {};
        const totalToProcess = await TicketmasterEvent.countDocuments(query);

        if (totalToProcess === 0) {
            console.log("✅ No source events to process.");
            return;
        }

        console.log(`🎯 Found ${totalToProcess} total source events. Processing in batches of ${BATCH_SIZE}...`);

        for (let skip = 0; skip < totalToProcess; skip += BATCH_SIZE) {
            console.log(`\n--- Processing Batch: ${skip + 1} to ${Math.min(skip + BATCH_SIZE, totalToProcess)} ---`);
            
            const sourceBatch = await TicketmasterEvent.find(query).skip(skip).limit(BATCH_SIZE).lean();
            if (sourceBatch.length === 0) break;

            const validatedBatch = await processAndValidateEvents({ ticketmaster: sourceBatch });
            stats.totalProcessed += sourceBatch.length;
            stats.totalValid += validatedBatch.length;

            const enhancedBatch = await enhancer.enhanceEvents(validatedBatch);
            const deduplicatedBatch = await deduplicateEvents(enhancedBatch);
            stats.duplicatesRemoved += enhancedBatch.length - deduplicatedBatch.length;

            const saveResult = await saveUnifiedEvents(deduplicatedBatch);
            stats.saved += saveResult.saved;
            stats.updated += saveResult.updated;
            stats.errors += saveResult.errors;
            stats.cleaned += saveResult.cleaned;
        }

        await generateProcessingReport(stats);

        console.log("✅ Enhanced unified processing pipeline completed successfully!");

    } catch (error) {
        console.error("❌ Unified processing pipeline failed:", error.message);
        stats.errors = (stats.errors || 0) + 1;
        await generateProcessingReport(stats);
        throw error;
    }
}

// --- Execution ---
async function main() {
    await connectDB();
    try {
        await processUnifiedEvents();
    } catch (error) {
        console.error(`❌ Unified processing failed: ${error.message}`);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

if (require.main === module) {
    // If this process is run as a web dyno, start a minimal health route
    const PORT = process.env.PORT || 0;
    if (PORT && Number(PORT) > 0) {
        try {
            const express = require('express');
            const app = express();
            app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));
            app.listen(PORT, () => console.log(`Health server listening on ${PORT}`));
        } catch (err) {
            console.warn('Express not available for health route:', err && err.message);
        }
    }
    main();
}

module.exports = { processUnifiedEvents, connectDB, disconnectDB };
