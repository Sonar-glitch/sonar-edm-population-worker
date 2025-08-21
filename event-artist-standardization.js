#!/usr/bin/env node
/**
 * Event-Artist Standardization
 *
 * Purpose: Replace string artist names in `events_unified` with ObjectId references
 * into `artistGenres` by writing `enrichment.lineupArtistIds: ObjectId[]`.
 *
 * Behavior:
 *  - Dry-run (DRY_RUN=1) prints proposed updates without writing.
 *  - Batch updates using bulkWrite for performance.
 *  - Optionally force overwrite existing lineupArtistIds with FORCE=1.
 *
 * ENV:
 *  - MONGODB_URI (required)
 *  - MONGODB_DB  (optional)
 *  - BATCH_SIZE  (optional, default 500)
 *  - DRY_RUN=1   (no writes)
 *  - FORCE=1     (overwrite existing lineupArtistIds)
 */

const { MongoClient, ObjectId } = require('mongodb');

function cleanArtistName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/["'’`]/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\(.*?\)/g, '')
    .replace(/^the\s+/i, '')
    .trim();
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI required'); process.exit(1); }
  const dbName = process.env.MONGODB_DB || null;
  const batchSize = +(process.env.BATCH_SIZE || 500);
  const dryRun = process.env.DRY_RUN === '1';
  const force = process.env.FORCE === '1';

  const client = new MongoClient(uri, { maxPoolSize: 5 });
  await client.connect();
  const db = dbName ? client.db(dbName) : client.db();
  const events = db.collection('events_unified');
  const artists = db.collection('artistGenres');

  // Build a name -> ObjectId map for efficient lookup. We will also include alternate name fields.
  console.log('Building artist name index from artistGenres...');
  const cursor = artists.find({}, { projection: { _id:1, name:1, artistName:1, originalName:1 } });
  const nameIndex = new Map();
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const id = doc._id;
    const candidates = [];
    if (doc.name) candidates.push(doc.name);
    if (doc.artistName) candidates.push(doc.artistName);
    if (doc.originalName) candidates.push(doc.originalName);
    for (const n of candidates) {
      const k = cleanArtistName(n).toLowerCase();
      if (!k) continue;
      if (!nameIndex.has(k)) nameIndex.set(k, id);
    }
  }

  console.log(`Indexed ${nameIndex.size} artist name keys.`);

  // Cursor over events with any artist strings
  const q = { $or: [ { artistList: { $exists: true, $ne: [] } }, { artists: { $exists: true, $ne: [] } } ] };
  const proj = { artistList:1, artists:1, 'enrichment.lineupArtistIds':1 };
  const eCursor = events.find(q, { projection: proj });

  let examined = 0, toUpdate = 0, skipped = 0, updated = 0;
  const missingNames = new Map();
  const bulk = [];

  while (await eCursor.hasNext()) {
    const doc = await eCursor.next();
    examined++;
    // If lineupArtistIds exists and we are not forcing, skip
    if (Array.isArray(doc.enrichment?.lineupArtistIds) && doc.enrichment.lineupArtistIds.length && !force) { skipped++; continue; }

    // Collect artist name strings from artistList and artists
    const names = [];
    if (Array.isArray(doc.artistList)) names.push(...doc.artistList.map(n => typeof n === 'string' ? n : (n && n.name) || ''));
    if (Array.isArray(doc.artists)) {
      for (const a of doc.artists) {
        if (!a) continue;
        if (typeof a === 'string') names.push(a);
        else if (a.name) names.push(a.name);
      }
    }

    const lookupIds = [];
    for (const raw of names) {
      const clean = cleanArtistName(raw).toLowerCase();
      if (!clean) continue;
      const id = nameIndex.get(clean);
      if (id) lookupIds.push(id);
      else {
        missingNames.set(clean, (missingNames.get(clean)||0) + 1);
      }
    }

    // Deduplicate and limit
    const uniqIds = Array.from(new Set(lookupIds.map(i => i.toString()))).map(s => ObjectId.createFromHexString(s));
    if (!uniqIds.length) { skipped++; continue; }

    // Prepare update
    toUpdate++;
    const updateOp = { updateOne: { filter: { _id: doc._id }, update: { $set: { 'enrichment.lineupArtistIds': uniqIds, 'enrichment.lastArtistStandardizedAt': new Date() } } } };
    bulk.push(updateOp);

    if (bulk.length >= batchSize) {
      console.log(`Prepared ${bulk.length} updates, executing${dryRun ? ' (dry-run)' : ''}...`);
      if (!dryRun) {
        const r = await events.bulkWrite(bulk, { ordered: false });
        updated += r.modifiedCount || 0;
      }
      bulk.length = 0;
    }
  }

  if (bulk.length) {
    console.log(`Prepared final ${bulk.length} updates, executing${dryRun ? ' (dry-run)' : ''}...`);
    if (!dryRun) {
      const r = await events.bulkWrite(bulk, { ordered: false });
      updated += r.modifiedCount || 0;
    }
  }

  // Summarize
  const topMissing = Array.from(missingNames.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const summary = { examined, toUpdate, skipped, updated, missingSampleCount: topMissing.length, topMissing };
  console.log('\nEVENT-ARTIST-STANDARDIZATION_SUMMARY');
  console.log(JSON.stringify(summary, null, 2));

  await client.close();
}

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}
