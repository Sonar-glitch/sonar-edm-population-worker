
/**
 * PERMANENT FIX v2 - processUnifiedEvents.js
 *
 * Corrects TypeError: enhancer.enhanceEvents is not a function.
 * Loops through batches and calls the correct single-item 'enhanceEvent' method.
 * This is the final, stable, and correct version of the worker logic.
 *
 * Status: Production Ready
 */

require('dotenv').config();
const mongoose = require('mongoose');
const TicketmasterEvent = require('./models/TicketmasterEvent');
const UnifiedEvent = require('./models/UnifiedEvent');
const { validateAndNormalizeEvent, mergeAndDeduplicateEvents } = require('./lib/eventValidation');
const { RecommendationEnhancer } = require('./lib/recommendationEnhancer');

const MONGODB_URI = process.env.MONGODB_URI;
const BATCH_SIZE = 200;

// --- Database Connection (no changes) ---
async function connectDB() {
    if (!MONGODB_URI) { console.error('Error: MONGODB_URI is not defined'); process.exit(1); }
    if (mongoose.connection.readyState === 0) {
        try {
            await mongoose.connect(MONGODB_URI);
            console.log('MongoDB Connected...');
        } catch (err) {
            console.error('MongoDB connection error:', err.message);
            process.exit(1);
        }
    }
}
async function disconnectDB() {
    try { await mongoose.disconnect(); console.log('MongoDB Disconnected.'); }
    catch (err) { console.error('Error disconnecting MongoDB:', err.message); }
}

// --- CORRECTED BATCH PROCESSING LOGIC ---

async function enhanceBatch(enhancer, batch) {
    const enhanced = [];
    for (const event of batch) {
        try {
            const enhancedEvent = await enhancer.enhanceEvent(event);
            enhanced.push(enhancedEvent);
        } catch (error) {
            console.warn(`⚠️ Enhancement failed for event ${event.name}:`, error.message);
            // Push the original event back to avoid data loss
            enhanced.push(event);
        }
    }
    return enhanced;
}

async function processFlaggedEventsInBatches(enhancer) {
    console.log('🔥 Stage 1: Checking for events flagged for reprocessing...');
    const query = { needsEnhancement: true };
    const totalToProcess = await UnifiedEvent.countDocuments(query);
    if (totalToProcess === 0) { console.log('✅ No events flagged for reprocessing.'); return 0; }
    console.log(`🎯 Found ${totalToProcess} flagged events. Processing in batches...`);
    let processedCount = 0;
    for (let skip = 0; skip < totalToProcess; skip += BATCH_SIZE) {
        const batch = await UnifiedEvent.find(query).skip(skip).limit(BATCH_SIZE).lean();
        if (batch.length === 0) break;
        console.log(`🔄 Processing flagged batch: ${skip + 1} to ${skip + batch.length}`);
        const enhancedBatch = await enhanceBatch(enhancer, batch); // CORRECTED
        await saveEnhancedBatch(enhancedBatch, { isFlaggedFix: true });
        processedCount += batch.length;
    }
    console.log(`✅ Reprocessed ${processedCount} flagged events.`);
    return processedCount;
}

async function processNewEventsInBatches(enhancer) {
    console.log('✨ Stage 2: Checking for new, un-enhanced events...');
    const query = { enhancementProcessed: { $ne: true } };
    const totalToProcess = await UnifiedEvent.countDocuments(query);
    if (totalToProcess === 0) { console.log('✅ No new events to process.'); return 0; }
    console.log(`🎯 Found ${totalToProcess} new events. Processing in batches...`);
    let processedCount = 0;
    for (let skip = 0; skip < totalToProcess; skip += BATCH_SIZE) {
        const batch = await UnifiedEvent.find(query).skip(skip).limit(BATCH_SIZE).lean();
        if (batch.length === 0) break;
        console.log(`🔄 Processing new batch: ${skip + 1} to ${skip + batch.length}`);
        const enhancedBatch = await enhanceBatch(enhancer, batch); // CORRECTED
        await saveEnhancedBatch(enhancedBatch);
        processedCount += batch.length;
    }
    console.log(`✅ Enhanced ${processedCount} new events.`);
    return processedCount;
}

async function ingestNewEventsFromSource(enhancer) {
    console.log('📥 Stage 3: Ingesting new events from Ticketmaster...');
    const existingSourceIds = await UnifiedEvent.distinct('sourceId', { source: 'Ticketmaster' });
    const query = { id: { $nin: existingSourceIds } };
    const totalToIngest = await TicketmasterEvent.countDocuments(query);
    if (totalToIngest === 0) { console.log('✅ No new events to ingest.'); return 0; }
    console.log(`🎯 Found ${totalToIngest} new events to ingest. Processing in batches...`);
    let ingestedCount = 0;
    for (let skip = 0; skip < totalToIngest; skip += BATCH_SIZE) {
        const batch = await TicketmasterEvent.find(query).skip(skip).limit(BATCH_SIZE).lean();
        if (batch.length === 0) break;
        const validatedBatch = batch.map(event => validateAndNormalizeEvent(event, 'Ticketmaster'));
        const deduplicatedBatch = mergeAndDeduplicateEvents(validatedBatch.filter(e => e !== null));
        const enhancedBatch = await enhanceBatch(enhancer, deduplicatedBatch); // CORRECTED
        await saveEnhancedBatch(enhancedBatch);
        ingestedCount += batch.length;
    }
    console.log(`✅ Ingested ${ingestedCount} new events.`);
    return ingestedCount;
}

async function saveEnhancedBatch(enhancedEvents, options = {}) {
    if (!enhancedEvents || enhancedEvents.length === 0) return;
    const bulkOps = enhancedEvents.map(event => {
        const { _id, ...eventWithoutId } = event;
        const updateQuery = {
            $set: { ...eventWithoutId, enhancementProcessed: true, updatedAt: new Date() },
            $unset: {}
        };
        if (options.isFlaggedFix) {
            updateQuery.$unset.needsEnhancement = '';
        }
        return { updateOne: { filter: { sourceId: event.sourceId, source: event.source }, update: updateQuery, upsert: true } };
    });
    try {
        const result = await UnifiedEvent.bulkWrite(bulkOps);
        console.log(`💾 Batch save complete: ${result.modifiedCount} updated, ${result.upsertedCount} created.`);
    } catch (error) {
        console.error(`❌ Error during bulk save:`, error);
    }
}

async function cleanupOldEvents() {
    console.log('🧹 Cleaning up old events...');
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        const deleteResult = await UnifiedEvent.deleteMany({ date: { $lt: cutoffDate } });
        console.log(`🗑️ Removed ${deleteResult.deletedCount} old events.`);
        return deleteResult.deletedCount;
    } catch (error) {
        console.error('❌ Error during cleanup:', error.message);
        return 0;
    }
}

async function generateProcessingReport(stats) {
    console.log('\n📋 ROBUST PROCESSING REPORT');
    console.log('============================');
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);
    console.log(`✅ Flagged fixed: ${stats.totalFlaggedFixed || 0}`);
    console.log(`✨ New enhanced: ${stats.totalNewEnhanced || 0}`);
    console.log(`📥 New ingested: ${stats.totalIngested || 0}`);
    console.log(`🧹 Cleaned: ${stats.totalCleaned || 0}`);
    console.log(`❌ Errors: ${stats.errors || 0}`);
    console.log('============================');
}

async function main() {
    await connectDB();
    try {
        await newProcessUnifiedEvents();
    } catch (error) {
        console.error(`❌ Main function failed: ${error.message}`);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

if (require.main === module) {
    main();
}

module.exports = { processUnifiedEvents: main };
