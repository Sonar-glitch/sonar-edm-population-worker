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
const { canonicalKey } = require('./lib/eventFingerprint');

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
        // Filter out events without a stable dedupe key (prefer eventKey, fall back to sourceId)
        const validOps = [];
        let skipped = 0;

    // batch control moved to main processing loop

        for (const event of events) {
            // Only consider eventKey valid if it's not null/undefined/empty string
            const hasEventKey = event && (event.eventKey !== undefined && event.eventKey !== null && event.eventKey !== '');
            const hasSourceId = event && (event.sourceId !== undefined && event.sourceId !== null && event.sourceId !== '');

            if (!hasEventKey && !hasSourceId) {
                skipped++;
                console.warn(`⚠️ Skipping upsert: missing eventKey and sourceId for event (name:${event && event.name} id:${event && event.id})`);
                continue;
            }

            // Build a clean update document that excludes null/undefined keys
            const updateDoc = Object.assign({}, event);
            // Defensive normalization: some source events contain a location object
            // with only `coordinates` (no `type`) or with numeric strings. Ensure
            // we always produce a proper GeoJSON Point here to avoid MongoDB
            // errors like "unknown GeoJSON type" during upsert.
            try {
                if (updateDoc.location && updateDoc.location.coordinates) {
                    const coords = updateDoc.location.coordinates;
                    if (Array.isArray(coords) && coords.length >= 2) {
                        const lon = Number(coords[0]);
                        const lat = Number(coords[1]);
                        if (Number.isFinite(lon) && Number.isFinite(lat)) {
                            // Normalize to explicit GeoJSON Point with numeric coords
                            updateDoc.location = { type: (updateDoc.location.type || 'Point'), coordinates: [lon, lat] };
                        } else {
                            updateDoc._location_normalization_failed = true;
                            delete updateDoc.location;
                        }
                    } else if (typeof coords === 'object' && coords !== null && ('lat' in coords || 'lon' in coords)) {
                        const lon = Number(coords.lon || coords.lng || coords.longitude);
                        const lat = Number(coords.lat || coords.latitude);
                        if (Number.isFinite(lon) && Number.isFinite(lat)) {
                            updateDoc.location = { type: (updateDoc.location.type || 'Point'), coordinates: [lon, lat] };
                        } else {
                            updateDoc._location_normalization_failed = true;
                            delete updateDoc.location;
                        }
                    }
                }
            } catch (e) {
                // Non-fatal: if something unexpected is present, drop location to
                // avoid causing a bulkWrite failure.
                updateDoc._location_normalization_failed = true;
                delete updateDoc.location;
            }
            if (updateDoc.eventKey === null || updateDoc.eventKey === undefined || updateDoc.eventKey === '') {
                delete updateDoc.eventKey;
            }
            if (updateDoc.sourceId === null || updateDoc.sourceId === undefined || updateDoc.sourceId === '') {
                delete updateDoc.sourceId;
            }

            // Normalize location to GeoJSON Point if it's present as coordinates array
            if (updateDoc.location && updateDoc.location.coordinates && Array.isArray(updateDoc.location.coordinates)) {
                const coords = updateDoc.location.coordinates;
                // Coerce numeric strings to numbers
                const lon = Number(coords[0]);
                const lat = Number(coords[1]);
                if (Number.isFinite(lon) && Number.isFinite(lat)) {
                    updateDoc.location = { type: (updateDoc.location.type || 'Point'), coordinates: [lon, lat] };
                } else {
                    // If coordinates are invalid, remove location and mark for telemetry
                    updateDoc._location_normalization_failed = true;
                    delete updateDoc.location;
                }
            } else if (updateDoc.location && updateDoc.location.type && updateDoc.location.coordinates && !Array.isArray(updateDoc.location.coordinates)) {
                // Defensive: unexpected coordinates shape — remove and log
                updateDoc._location_normalization_failed = true;
                delete updateDoc.location;
            }

            // Recompute filter based on cleaned fields
            let filter;

            // Attempt to compute a canonical, source-agnostic eventKey first
            let computedKey = null;
            try {
                computedKey = canonicalKey({ name: updateDoc.name, date: updateDoc.date, venue: updateDoc.venue, location: updateDoc.location, sourceId: updateDoc.sourceId });
            } catch (e) {
                // ignore and fall back
            }

            if (computedKey) {
                filter = { eventKey: computedKey };
                updateDoc.eventKey = computedKey;
            } else {
                if (updateDoc.eventKey !== undefined) {
                    // ensure eventKey is defined and not null
                    if (updateDoc.eventKey === null) delete updateDoc.eventKey;
                    else filter = { eventKey: updateDoc.eventKey };
                }

                if (!filter && updateDoc.sourceId !== undefined) {
                    if (updateDoc.sourceId === null) delete updateDoc.sourceId;
                    else {
                        // Fallback: use a source-derived key only when canonical cannot be built
                        const derivedEventKey = `src:${updateDoc.sourceId}`;
                        filter = { eventKey: derivedEventKey };
                        updateDoc.eventKey = derivedEventKey;
                    }
                }
            }

            if (!filter) {
                skipped++;
                console.warn(`⚠️ Skipping upsert after cleaning: missing eventKey and sourceId for event (name:${event && event.name} id:${event && event.id})`);
                continue;
            }

            // Make sure updateDoc contains the filter key so upsert inserts it
            if (filter.eventKey && updateDoc.eventKey === undefined) updateDoc.eventKey = filter.eventKey;
            if (filter.sourceId && updateDoc.sourceId === undefined) updateDoc.sourceId = filter.sourceId;

            // Remove any keys with null values to avoid inserting nulls that violate unique indexes
            Object.keys(updateDoc).forEach(k => {
                if (updateDoc[k] === null) delete updateDoc[k];
            });

            // Ensure inserted documents get a unique eventKey when missing to avoid null unique-index collisions
            const setOnInsert = {};
            if (!updateDoc.eventKey && updateDoc.sourceId) {
                setOnInsert.eventKey = `src:${updateDoc.sourceId}`;
            }

            const updatePayload = { $set: updateDoc };
            if (Object.keys(setOnInsert).length > 0) updatePayload.$setOnInsert = setOnInsert;

            // Provenance: ensure each upsert records its source/sourceId for traceability
            try {
                updatePayload.$addToSet = updatePayload.$addToSet || {};
                const srcEntry = {};
                if (updateDoc.source) srcEntry.source = updateDoc.source;
                if (updateDoc.sourceId) srcEntry.sourceId = updateDoc.sourceId;
                srcEntry.recordedAt = updateDoc.updatedAt || updateDoc.createdAt || new Date();
                updatePayload.$addToSet.sources = srcEntry;
            } catch (e) {
                // non-fatal; provenance best-effort
            }

            validOps.push({
                updateOne: {
                    filter,
                    update: updatePayload,
                    upsert: true
                }
            });
        }

        if (validOps.length === 0) {
            console.log(`ℹ️ No valid events to upsert (skipped ${skipped} invalid events)`);
            return { saved: 0, updated: 0, errors: skipped, cleaned: 0 };
        }

        // Diagnostic: print sample of constructed bulk ops so we can debug null eventKey issues
        try {
            const sampleOps = validOps.slice(0, 10).map(o => ({ filter: o.updateOne.filter, update: o.updateOne.update }));
            console.log(`ℹ️ Constructed ${validOps.length} valid bulk ops. Sample (up to 10):`, JSON.stringify(sampleOps, null, 2));
        } catch (e) {
            console.warn('⚠️ Failed to stringify sample ops for diagnostics:', e && e.message);
        }

        // Diagnostic: count location normalization failures in the prepared ops
        try {
            const locFailures = validOps.reduce((acc, op) => {
                const upd = op.updateOne && op.updateOne.update && op.updateOne.update.$set;
                return acc + ((upd && upd._location_normalization_failed) ? 1 : 0);
            }, 0);
            if (locFailures > 0) console.warn(`⚠️ Location normalization failed for ${locFailures} prepared ops (they will be saved without location).`);
        } catch (e) {
            // non-fatal
        }

        // Diagnostic counts: how many ops will set eventKey on insert, how many include eventKey in $set
        try {
            let opsWithSetOnInsert = 0;
            let opsWithSetEventKey = 0;
            let opsWithNoEventKeyHandling = 0;
            for (const op of validOps) {
                const update = op.updateOne && op.updateOne.update;
                const hasSetOnInsert = update && update.$setOnInsert && Object.prototype.hasOwnProperty.call(update.$setOnInsert, 'eventKey');
                const hasSetEventKey = update && update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'eventKey');
                if (hasSetOnInsert) opsWithSetOnInsert++;
                if (hasSetEventKey) opsWithSetEventKey++;
                if (!hasSetOnInsert && !hasSetEventKey) opsWithNoEventKeyHandling++;
            }
            console.log(`ℹ️ Bulk-op eventKey handling: setOnInsert=${opsWithSetOnInsert}, set=${opsWithSetEventKey}, none=${opsWithNoEventKeyHandling}`);
        } catch (e) {
            console.warn('⚠️ Failed to compute bulk-op eventKey stats:', e && e.message);
        }

        // Safety scan: drop any ops that would upsert or filter on null/undefined/empty eventKey
        console.log(`ℹ️ Performing safety scan on ${validOps.length} bulk ops before bulkWrite...`);
        const safeOps = [];
        const unsafeSamples = [];
        let dropped = 0;
        for (const op of validOps) {
            try {
                const filter = op.updateOne && op.updateOne.filter;
                const update = op.updateOne && op.updateOne.update;

                const filterHasEventKey = filter && Object.prototype.hasOwnProperty.call(filter, 'eventKey');
                const filterEventKeyValue = filterHasEventKey ? filter.eventKey : undefined;
                const updateSetsEventKey = update && update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'eventKey');
                const updateEventKeyValue = updateSetsEventKey ? update.$set.eventKey : undefined;

                // Consider unsafe if the filter explicitly contains eventKey that is null/undefined/empty string
                const filterHasBadEventKey = filterHasEventKey && (filterEventKeyValue === null || filterEventKeyValue === undefined || filterEventKeyValue === '');
                const updateSetsBadEventKey = updateSetsEventKey && (updateEventKeyValue === null || updateEventKeyValue === undefined || updateEventKeyValue === '');

                if (filterHasBadEventKey || updateSetsBadEventKey) {
                    dropped++;
                    if (unsafeSamples.length < 5) unsafeSamples.push({ filter, update });
                    continue;
                }

                // Also drop ops where neither filter contains eventKey nor sourceId (defensive)
                const filterHasSourceId = filter && Object.prototype.hasOwnProperty.call(filter, 'sourceId');
                const filterSourceIdValue = filterHasSourceId ? filter.sourceId : undefined;
                if (!filterHasEventKey && !filterHasSourceId) {
                    dropped++;
                    if (unsafeSamples.length < 5) unsafeSamples.push({ filter, update, reason: 'missing filter key (eventKey/sourceId)' });
                    continue;
                }

                safeOps.push(op);
            } catch (e) {
                dropped++;
            }
        }

        if (safeOps.length === 0) {
            console.warn(`⚠️ All bulk ops were unsafe and dropped (${dropped} ops). Skipping bulkWrite.`);
            if (unsafeSamples.length > 0) console.warn('Unsafe op samples:', unsafeSamples);
            return { saved: 0, updated: 0, errors: skipped + dropped, cleaned: 0 };
        }

        if (dropped > 0) {
            console.warn(`⚠️ Dropped ${dropped} unsafe bulk ops to avoid duplicate-key/null-index issues.`);
            if (unsafeSamples.length > 0) console.warn('Unsafe op samples:', unsafeSamples);
        }

        // Defensive patch: ensure every upsert that can be assigned an eventKey on insert has one.
        let patched = 0;
        for (const op of safeOps) {
            try {
                const filter = op.updateOne && op.updateOne.filter;
                const update = op.updateOne && op.updateOne.update;
                if (!update) continue;

                const hasSetOnInsert = update.$setOnInsert && Object.prototype.hasOwnProperty.call(update.$setOnInsert, 'eventKey');
                const hasSetEventKey = update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'eventKey');

                // Remove any explicit null/undefined/empty eventKey in $set to avoid inserting nulls
                if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'eventKey')) {
                    const v = update.$set.eventKey;
                    if (v === null || v === undefined || v === '') {
                        delete update.$set.eventKey;
                    }
                }

                // Try to derive sourceId from filter or update payloads
                const derivedSourceId = (filter && filter.sourceId) || (update.$set && update.$set.sourceId) || (update.$setOnInsert && update.$setOnInsert.sourceId);
                const derivedSource = (filter && filter.source) || (update.$set && update.$set.source) || (update.$setOnInsert && update.$setOnInsert.source);

                // If filter only has sourceId but not source, and we can derive source from update, normalize filter to include source
                if (filter && derivedSource && !Object.prototype.hasOwnProperty.call(filter, 'source')) {
                    filter.source = derivedSource;
                }

                // Ensure $setOnInsert.eventKey exists when possible
                if (!hasSetOnInsert && !hasSetEventKey && derivedSourceId) {
                    update.$setOnInsert = update.$setOnInsert || {};
                    update.$setOnInsert.eventKey = `src:${derivedSourceId}`;
                    patched++;
                }

                // If still no eventKey handling and filter lacks both eventKey and sourceId, mark as unsafe by deleting from safeOps
                const finalHasSetOnInsert = update.$setOnInsert && Object.prototype.hasOwnProperty.call(update.$setOnInsert, 'eventKey');
                const finalHasSetEventKey = update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'eventKey');
                const finalFilterHasEventKey = filter && Object.prototype.hasOwnProperty.call(filter, 'eventKey') && filter.eventKey;
                const finalFilterHasSourceId = filter && Object.prototype.hasOwnProperty.call(filter, 'sourceId') && filter.sourceId;
                if (!finalHasSetOnInsert && !finalHasSetEventKey && !finalFilterHasEventKey && !finalFilterHasSourceId) {
                    // remove op from safeOps by marking a special flag; we'll filter them out shortly
                    op.__unsafe = true;
                }
            } catch (e) {
                // ignore
            }
        }
        if (patched > 0) console.log(`ℹ️ Patched ${patched} safeOps to add $setOnInsert.eventKey to avoid null eventKey inserts.`);

        // Filter out any ops we flagged as unsafe
        const finalSafeOps = safeOps.filter(o => !o.__unsafe);
        const finalDroppedByPatch = safeOps.length - finalSafeOps.length;
        if (finalDroppedByPatch > 0) console.warn(`⚠️ Dropped ${finalDroppedByPatch} ops after final normalization because they remained unsafe.`);

        // Final enforcement: ensure any upsertable op filtered by sourceId gets a $setOnInsert.eventKey
        let finalPatched = 0;
        for (const op of finalSafeOps) {
            try {
                const filter = op.updateOne && op.updateOne.filter;
                const update = op.updateOne && op.updateOne.update;
                if (!filter || !update) continue;

                const hasSetOnInsert = update.$setOnInsert && Object.prototype.hasOwnProperty.call(update.$setOnInsert, 'eventKey');
                const hasSetEventKey = update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'eventKey');

                if (!hasSetOnInsert && !hasSetEventKey && filter.sourceId) {
                    update.$setOnInsert = update.$setOnInsert || {};
                    update.$setOnInsert.eventKey = `src:${filter.sourceId}`;
                    finalPatched++;
                }
            } catch (e) {
                // ignore
            }
        }
        if (finalPatched > 0) console.log(`ℹ️ Added $setOnInsert.eventKey to ${finalPatched} finalSafeOps before bulkWrite.`);

        // Final diagnostic: compute the effective eventKey that would be present after an insert and drop ops that would leave it missing/null/empty
        const beforeWriteOps = [];
        const droppedBeforeWrite = [];
        for (const op of finalSafeOps) {
            try {
                const filter = op.updateOne && op.updateOne.filter;
                const update = op.updateOne && op.updateOne.update;
                const keyFromFilter = filter && filter.eventKey;
                const keyFromSet = update && update.$set && update.$set.eventKey;
                const keyFromSetOnInsert = update && update.$setOnInsert && update.$setOnInsert.eventKey;
                const effectiveKey = keyFromFilter || keyFromSet || keyFromSetOnInsert;
                if (!effectiveKey || effectiveKey === null || effectiveKey === undefined || effectiveKey === '') {
                    droppedBeforeWrite.push({ filter, update, effectiveKey });
                    continue;
                }
                beforeWriteOps.push(op);
            } catch (e) {
                droppedBeforeWrite.push({ err: e && e.message });
            }
        }
        if (droppedBeforeWrite.length > 0) {
            console.warn(`⚠️ Dropping ${droppedBeforeWrite.length} finalSafeOps because they would insert without a valid eventKey (preventing duplicate nulls).`);
            if (droppedBeforeWrite.length <= 5) console.warn('Dropped op samples:', JSON.stringify(droppedBeforeWrite, null, 2));
        }

        // Use beforeWriteOps for the actual bulkWrite
        const opsToWrite = beforeWriteOps;

        let result;
        let cleanupCount = 0;
        try {
            if (!opsToWrite || opsToWrite.length === 0) {
                console.warn('⚠️ No safe ops remain to write after final normalization. Skipping bulkWrite.');
                result = { upsertedCount: 0, modifiedCount: 0, writeErrors: [] };
            } else {
                result = await UnifiedEvent.bulkWrite(opsToWrite, { ordered: false });
            }
            // Auto-cleanup old events during save
            cleanupCount = await cleanupOldEvents(UnifiedEvent);
            console.log(`✅ Bulk operation complete: ${result.upsertedCount} new, ${result.modifiedCount} updated`);
            if (cleanupCount > 0) {
                console.log(`🧹 Auto-cleanup: Removed ${cleanupCount} old events during save`);
            }
        } catch (bulkErr) {
            console.error('❌ bulkWrite failed:', bulkErr && bulkErr.message);
            try {
                if (bulkErr && bulkErr.writeErrors && bulkErr.writeErrors.length > 0) {
                    console.error(`❌ bulkWrite writeErrors (${bulkErr.writeErrors.length}):`);
                    bulkErr.writeErrors.forEach((we, idx) => {
                        console.error(`  [${idx}] code=${we.code} errmsg=${we.errmsg} opIndex=${we.index}`);
                        if (we.err && we.err.op) {
                            console.error('    op sample:', JSON.stringify(we.err.op, null, 2));
                        }
                    });
                }
            } catch (logErr) {
                console.error('⚠️ Failed to log bulkWrite errors in detail:', logErr && logErr.message);
            }

            // Log a sample of finalSafeOps near the beginning to inspect their filters/updates
            try {
                const sample = finalSafeOps.slice(0, 10).map((o, i) => ({ idx: i, filter: o.updateOne.filter, update: o.updateOne.update }));
                console.error('❌ Sample safeOps (up to 10):', JSON.stringify(sample, null, 2));
            } catch (e) {
                console.error('⚠️ Failed to stringify safeOps sample:', e && e.message);
            }

            // Re-throw to ensure caller sees the failure
            throw bulkErr;
        }
        if (cleanupCount > 0) {
            console.log(`🧹 Auto-cleanup: Removed ${cleanupCount} old events during save`);
        }
        
        return {
            saved: result.upsertedCount,
            updated: result.modifiedCount,
            errors: result.writeErrors ? result.writeErrors.length : 0,
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
    // Allow forcing enhancement in one-off runs using FORCE_RECOMMENDATION_ENHANCEMENT=true
    const enhancerAvailable = enhancer && typeof enhancer.enhanceEvents === 'function' && (enhancer.enabled || process.env.FORCE_RECOMMENDATION_ENHANCEMENT === 'true');
    if (!enhancerAvailable) {
        console.log("⚠️ Recommendation enhancement is disabled or unavailable. Continuing without enhancement.");
    } else if (process.env.FORCE_RECOMMENDATION_ENHANCEMENT === 'true' && !enhancer.enabled) {
        console.log('⚠️ Recommendation enhancement forced on for this run via FORCE_RECOMMENDATION_ENHANCEMENT');
    }

    try {
    // Allow overriding batch size for dry-runs via env (safe for testing)
    const BATCH_SIZE = parseInt(process.env.PROCESS_BATCH_SIZE, 10) || 200;
    // Batch control for dry-runs
    let batchesProcessed = 0;
    const maxBatches = process.env.PROCESS_MAX_BATCHES ? parseInt(process.env.PROCESS_MAX_BATCHES, 10) : null;
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

            const enhancedBatch = enhancerAvailable ? await enhancer.enhanceEvents(validatedBatch) : validatedBatch;
            const deduplicatedBatch = await deduplicateEvents(enhancedBatch);
            stats.duplicatesRemoved += enhancedBatch.length - deduplicatedBatch.length;

            const saveResult = await saveUnifiedEvents(deduplicatedBatch);
            stats.saved += saveResult.saved;
            stats.updated += saveResult.updated;
            stats.errors += saveResult.errors;
            stats.cleaned += saveResult.cleaned;

            batchesProcessed++;
            if (maxBatches && batchesProcessed >= maxBatches) {
                console.log(`ℹ️ Reached PROCESS_MAX_BATCHES=${maxBatches}, stopping after ${batchesProcessed} batches (dry-run).`);
                break;
            }
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
