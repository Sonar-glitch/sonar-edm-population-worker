#!/usr/bin/env node
/**
 * PH4 PRE-ENRICHMENT LINEUP ARTIST IDS POPULATION
 * -------------------------------------------------------
 * Populates enrichment.lineupArtistIds (and lineupHash) for events_unified
 * from existing event root artistIds OR by resolving artist names to artistGenres.
 *
 * ORDER OF SOURCES (first non-empty wins):
 *  1. event.artistIds (already standardized ObjectId references)
 *  2. event.artistList (array of strings)
 *  3. event.artists[].name / .artistName / .originalName (mixed structures)
 *
 * Name resolution uses artistGenres name candidates: artistName, originalName, name
 * (all lowercased for matching). Stops after accumulating unique ObjectIds.
 *
 * Writes only when enrichment.lineupArtistIds is missing or empty OR --force flag set.
 *
 * ENV:
 *   MONGODB_URI (required)
 *   MONGODB_DB (optional)
 *   DRY_RUN=1 (no writes)
 *   FORCE_LINEUP=1 (recompute even if non-empty)
 */

const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

function stableHash(arr) {
  return crypto.createHash('sha1').update(JSON.stringify(arr.map(id=>id.toString()).sort())).digest('hex').slice(0,16);
}

function extractCandidateNames(event) {
  const names = new Set();
  if (Array.isArray(event.artistList)) {
    event.artistList.filter(x=>typeof x === 'string').forEach(n=> names.add(n));
  }
  if (Array.isArray(event.artists)) {
    for (const a of event.artists) {
      if (!a) continue;
      const candidate = a.name || a.artistName || a.originalName;
      if (candidate && typeof candidate === 'string') names.add(candidate);
    }
  }
  return Array.from(names);
}

async function buildArtistLookup(coll) {
  const cursor = coll.find({}, { projection: { artistName:1, originalName:1, name:1 } });
  const map = new Map(); // lowerName -> ObjectId
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const candidates = [doc.artistName, doc.originalName, doc.name].filter(Boolean);
    for (const c of candidates) {
      const key = c.toLowerCase();
      if (!map.has(key)) map.set(key, doc._id); // first wins
    }
  }
  return map;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI required'); process.exit(1); }
  const dbName = process.env.MONGODB_DB || process.env.MONGODB_DBNAME;
  const dryRun = process.env.DRY_RUN === '1';
  const force = process.env.FORCE_LINEUP === '1';

  const client = new MongoClient(uri, { maxPoolSize: 5 });
  const summary = { examined:0, updated:0, skippedPresent:0, resolvedFrom:{artistIds:0, names:0}, unmatchedNameLookups:0, start: new Date().toISOString(), durationMs:null };

  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    const events = db.collection('events_unified');
    const artists = db.collection('artistGenres');

    // Pre-build lookup map for name resolution only if needed
    let nameMap = null;

    const query = force ? {} : { $or: [ { 'enrichment.lineupArtistIds': { $exists:false } }, { 'enrichment.lineupArtistIds': { $size: 0 } } ] };
    const projection = { artistIds:1, artistList:1, artists:1, 'enrichment.lineupArtistIds':1, 'enrichment.lineupHash':1 };
    const cursor = events.find(query, { projection });
    const bulk = [];

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      summary.examined++;
      const existing = doc.enrichment && Array.isArray(doc.enrichment.lineupArtistIds) && doc.enrichment.lineupArtistIds.length > 0;
      if (existing && !force) { summary.skippedPresent++; continue; }

      let source = null;
      let lineupIds = [];

      if (Array.isArray(doc.artistIds) && doc.artistIds.length) {
        lineupIds = doc.artistIds.filter(id => ObjectId.isValid(id)).map(id=> new ObjectId(id));
        if (lineupIds.length) source = 'artistIds';
      }

      if (!lineupIds.length) {
        const names = extractCandidateNames(doc);
        if (names.length) {
          if (!nameMap) nameMap = await buildArtistLookup(artists);
          for (const n of names) {
            const id = nameMap.get(n.toLowerCase());
            if (id) lineupIds.push(id);
            else summary.unmatchedNameLookups++;
          }
          // unique
          const seen = new Set();
          lineupIds = lineupIds.filter(id=> { const k=id.toString(); if (seen.has(k)) return false; seen.add(k); return true; });
          if (lineupIds.length) source = 'names';
        }
      }

      if (!lineupIds.length) continue; // nothing to set

      const lineupHash = stableHash(lineupIds);
      if (source) summary.resolvedFrom[source]++;

      const update = { 'enrichment.lineupArtistIds': lineupIds, 'enrichment.lineupHash': lineupHash };

      bulk.push({ updateOne: { filter: { _id: doc._id }, update: { $set: update } } });
      if (bulk.length === 500) {
        if (!dryRun) { const res = await events.bulkWrite(bulk, { ordered:false }); summary.updated += res.modifiedCount; }
        bulk.length = 0;
      }
    }

    if (bulk.length && !dryRun) {
      const res = await events.bulkWrite(bulk, { ordered:false }); summary.updated += res.modifiedCount;
    }

  } catch (e) {
    summary.error = e.message;
    console.error('Lineup population failed:', e);
  } finally {
    summary.durationMs = Date.now() - Date.parse(summary.start);
    console.log('\nPH4_LINEUP_POPULATION_SUMMARY');
    console.log(JSON.stringify(summary, null, 2));
    try { await client.close(); } catch {}
    if (summary.error) process.exitCode = 1;
  }
}

if (require.main === module) main();
