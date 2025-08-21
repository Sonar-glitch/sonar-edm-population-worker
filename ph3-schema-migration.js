#!/usr/bin/env node
/**
 * PH3 SCHEMA & INDEX MIGRATION
 * -------------------------------------------------------
 * Goals:
 * 1. Backfill eventKey for all events_unified docs (lower(name)|ISODate|lower(venueName))
 * 2. Detect potential eventKey collisions before creating unique index
 * 3. Create indexes:
 *    - unique { eventKey:1 }
 *    - compound { date:1, 'enrichment.edmScore': -1 }
 * 4. Ensure enrichment placeholder fields exist on events_unified
 * 5. Extend artistGenres with PH3 placeholder fields
 * 6. Add TTL index on user_sound_profiles.expiresAt (configurable)
 * 7. Add placeholder centroid-related fields to user_sound_profiles (if present)
 *
 * Idempotent: Safe to re-run; it only adds missing fields / indexes.
 * Outputs concise JSON summary for health tracking.
 *
 * ENV:
 *   MONGODB_URI (required)
 *   MONGODB_DB  (optional, defaults to DB in URI / 'test')
 *   PROFILE_TTL_DAYS (optional, default 30)
 *   EVENT_KEY_DRY_RUN=1 (only compute & report, skip writes / index creation)
 */

const { MongoClient } = require('mongodb');

function isoDatePart(value) {
  try {
    const d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d)) return '';
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch { return ''; }
}

function norm(str) {
  return (str || '').toString().trim().toLowerCase();
}

function buildEventKey(doc) {
  return [ norm(doc.name), isoDatePart(doc.date), norm(doc.venue?.name || doc.venueName) ].join('|');
}

async function backfillEventKeys(db, summary, dryRun) {
  const coll = db.collection('events_unified');
  const missingCursor = coll.find({ $or: [ { eventKey: { $exists: false } }, { eventKey: '' }, { eventKey: null } ] }, { projection: { name:1, date:1, 'venue.name':1, venueName:1 } });
  let processed = 0, modified = 0; const bulkOps = [];
  while (await missingCursor.hasNext()) {
    const doc = await missingCursor.next();
    processed++;
    const ek = buildEventKey(doc);
    if (!ek || ek === '||') continue; // skip unusable
    bulkOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { eventKey: ek } } } });
    if (bulkOps.length === 500) {
      if (!dryRun) {
        const res = await coll.bulkWrite(bulkOps, { ordered: false });
        modified += res.modifiedCount;
      }
      bulkOps.length = 0;
    }
  }
  if (bulkOps.length && !dryRun) {
    const res = await coll.bulkWrite(bulkOps, { ordered: false });
    modified += res.modifiedCount;
  }
  summary.eventKey = { backfillProcessed: processed, backfillModified: modified };

  // Collision detection
  const dupAgg = await coll.aggregate([
    { $match: { eventKey: { $exists: true, $ne: '' } } },
    { $group: { _id: '$eventKey', c: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { c: { $gt: 1 } } },
    { $project: { _id: 1, c:1 } },
    { $limit: 50 }
  ]).toArray();
  summary.eventKey.duplicateGroupsSample = dupAgg;
  summary.eventKey.duplicateGroupCount = dupAgg.length;
  if (dupAgg.length) summary.warnings.push(`Found ${dupAgg.length} duplicate eventKey groups (sample logged)`);
  return dupAgg.length === 0; // safe for unique index
}

async function ensureEventIndexes(db, summary, safeUnique, dryRun) {
  const coll = db.collection('events_unified');
  const existing = await coll.listIndexes().toArray();
  const hasEventKey = existing.some(i => i.key && i.key.eventKey === 1);
  const hasEventKeyUnique = existing.some(i => i.key && i.key.eventKey === 1 && i.unique);
  const hasDateEdm = existing.some(i => i.key && i.key.date === 1 && Object.keys(i.key).some(k => k === 'enrichment.edmScore'));
  summary.indexes.events_unified = { hasEventKey, hasEventKeyUnique, hasDateEdmScore: hasDateEdm };
  if (!dryRun) {
    if (!hasEventKeyUnique && safeUnique) {
      try {
        await coll.createIndex({ eventKey: 1 }, { unique: true, background: true });
        summary.indexes.events_unified.createdEventKeyUnique = true;
      } catch (e) {
        summary.warnings.push('Failed to create unique eventKey index: ' + e.message);
      }
    } else if (!safeUnique) {
      summary.warnings.push('Skipped unique eventKey index due to duplicates');
    }
    if (!hasDateEdm) {
      try {
        await coll.createIndex({ date: 1, 'enrichment.edmScore': -1 }, { background: true });
        summary.indexes.events_unified.createdDateEdmScore = true;
      } catch (e) {
        summary.warnings.push('Failed to create date+edmScore index: ' + e.message);
      }
    }
  }
}

async function ensureEventEnrichmentPlaceholders(db, summary, dryRun) {
  const coll = db.collection('events_unified');
  const fields = [
    ['enrichment.lineupArtistIds', []],
    ['enrichment.normalizedGenres', []],
    ['enrichment.lineupCentroids', []],
    ['enrichment.edmScore', null],
    ['enrichment.lineupHash', null],
    ['enrichment.audioCoverage', null],
    ['enrichment.featuresVersion', 1],
    ['enrichment.lastEnrichedAt', null]
  ];
  let modified = 0;
  for (const [path, value] of fields) {
    const query = { [path]: { $exists: false } };
    if (!dryRun) {
      const res = await coll.updateMany(query, { $set: { [path]: value } });
      modified += res.modifiedCount;
    } else {
      const count = await coll.countDocuments(query).catch(()=>0);
      modified += count; // approximate potential changes
    }
  }
  summary.eventsEnrichmentPlaceholders = { modifiedApprox: modified };
}

async function extendArtistGenres(db, summary, dryRun) {
  const coll = db.collection('artistGenres');
  const fields = [
    ['recentTrackIds', []],
    ['topTrackIds', []],
    ['recentCentroids', []],
    ['longTermCentroids', []],
    ['styleShiftScore', null],
    ['edmWeight', 0],
    ['lastAudioRefreshAt', null]
  ];
  let modified = 0;
  for (const [path, value] of fields) {
    const query = { [path]: { $exists: false } };
    if (!dryRun) {
      const res = await coll.updateMany(query, { $set: { [path]: value } });
      modified += res.modifiedCount;
    } else {
      const count = await coll.countDocuments(query).catch(()=>0);
      modified += count;
    }
  }
  summary.artistGenresPlaceholders = { modifiedApprox: modified };
}

async function extendUserProfiles(db, summary, dryRun, ttlDays) {
  const coll = db.collection('user_sound_profiles');
  const exists = await coll.countDocuments().catch(()=>0);
  if (!exists) { summary.userProfiles = { present:false }; return; }
  const fields = [
    ['recentCentroids', []],
    ['topCentroids', []],
    ['genreVector', {}],
    ['normalizedGenres', []],
    ['confidence.genreCoverage', null],
    ['confidence.audioCoverage', null],
    ['confidence.recencyFreshnessDays', null],
    ['recencyDecayParams.halfLifeDays', 14]
  ];
  let modified = 0;
  for (const [path, value] of fields) {
    const query = { [path]: { $exists: false } };
    if (!dryRun) {
      const res = await coll.updateMany(query, { $set: { [path]: value } });
      modified += res.modifiedCount;
    } else {
      const count = await coll.countDocuments(query).catch(()=>0);
      modified += count;
    }
  }
  // TTL: ensure expiresAt & index
  const ttlSeconds = ttlDays * 86400;
  if (!dryRun) {
    await coll.updateMany({ expiresAt: { $exists: false } }, { $set: { expiresAt: new Date(Date.now() + ttlSeconds * 1000) } });
  }
  let ttlIndexExists = false;
  const idx = await coll.listIndexes().toArray().catch(()=>[]);
  ttlIndexExists = idx.some(i => i.key && i.key.expiresAt === 1 && typeof i.expireAfterSeconds === 'number');
  if (!ttlIndexExists && !dryRun) {
    try {
      await coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: ttlSeconds, background: true });
      ttlIndexExists = true;
    } catch (e) {
      summary.warnings.push('Failed to create TTL index on user_sound_profiles.expiresAt: ' + e.message);
    }
  }
  summary.userProfiles = { present:true, modifiedApprox: modified, ttlIndex: ttlIndexExists, ttlSeconds };
}

async function main() {
  const start = Date.now();
  const summary = { timestamp: new Date().toISOString(), warnings: [], indexes: {}, durationMs: null };
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB || process.env.MONGODB_DBNAME; // optional
  const ttlDays = +(process.env.PROFILE_TTL_DAYS || 30);
  const dryRun = process.env.EVENT_KEY_DRY_RUN === '1';
  const forceRun = process.env.FORCE_PH3_RUN === '1';
  const client = new MongoClient(uri, { maxPoolSize: 5 });
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    summary.db = db.databaseName;

    // --- Idempotent Early Inspection (skip heavy work if everything already in place) ---
    if (!forceRun) {
      const eventsColl = db.collection('events_unified');
      const artistColl = db.collection('artistGenres');
      const userProfColl = db.collection('user_sound_profiles');

      const missingEventKeys = await eventsColl.countDocuments({ $or:[ { eventKey: { $exists:false } }, { eventKey:'' }, { eventKey:null } ] });
      // Representative enrichment placeholder field check
      const missingEnrichmentField = await eventsColl.countDocuments({ 'enrichment.lineupArtistIds': { $exists:false } });
      const missingArtistField = await artistColl.countDocuments({ recentCentroids: { $exists:false } }).catch(()=>0);
      const userProfilesPresent = await userProfColl.countDocuments().catch(()=>0) > 0;
      let missingUserField = 0; let ttlOk = true;
      if (userProfilesPresent) {
        missingUserField = await userProfColl.countDocuments({ recentCentroids: { $exists:false } }).catch(()=>0);
        const idx = await userProfColl.listIndexes().toArray().catch(()=>[]);
        ttlOk = idx.some(i => i.key && i.key.expiresAt === 1 && typeof i.expireAfterSeconds === 'number');
      }
      const existingEventIndexes = await eventsColl.listIndexes().toArray().catch(()=>[]);
      const hasEventKeyUnique = existingEventIndexes.some(i => i.key && i.key.eventKey === 1 && i.unique);
      const hasDateEdm = existingEventIndexes.some(i => i.key && i.key.date === 1 && Object.keys(i.key).some(k => k === 'enrichment.edmScore'));

      const nothingPending = missingEventKeys === 0 && missingEnrichmentField === 0 && missingArtistField === 0 && (!userProfilesPresent || (missingUserField === 0 && ttlOk)) && hasEventKeyUnique && hasDateEdm;
      summary.idempotentCheck = {
        missingEventKeys,
        missingEnrichmentField,
        missingArtistField,
        userProfilesPresent,
        missingUserField,
        ttlOk,
        hasEventKeyUnique,
        hasDateEdm,
        skipped: nothingPending
      };
      if (nothingPending) {
        summary.skipped = true;
        summary.note = 'PH3 schema already fully applied (use FORCE_PH3_RUN=1 to override).';
        console.log('\nPH3_SCHEMA_MIGRATION_SUMMARY');
        console.log(JSON.stringify(summary, null, 2));
        return; // exit early – idempotent no-op
      }
    } else {
      summary.forceRun = true;
    }

    const safeUnique = await backfillEventKeys(db, summary, dryRun);
    await ensureEventEnrichmentPlaceholders(db, summary, dryRun);
    await extendArtistGenres(db, summary, dryRun);
    await extendUserProfiles(db, summary, dryRun, ttlDays);
    await ensureEventIndexes(db, summary, safeUnique, dryRun);

  } catch (e) {
    summary.error = e.message;
    console.error('Migration failed:', e);
  } finally {
    try { await client.close(); } catch {}
    summary.durationMs = Date.now() - start;
    console.log('\nPH3_SCHEMA_MIGRATION_SUMMARY');
    console.log(JSON.stringify(summary, null, 2));
    if (summary.error) process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
