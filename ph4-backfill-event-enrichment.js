#!/usr/bin/env node
/**
 * PH4 EVENT ENRICHMENT BACKFILL
 * -------------------------------------------------------
 * Computes initial enrichment fields for events_unified:
 *  - enrichment.normalizedGenres (union of lineup artists' normalizedGenres)
 *  - enrichment.edmScore (avg artist edmWeight * lineup coverage fraction)
 *  - enrichment.lineupHash (stable hash of sorted lineupArtistIds) if missing
 *  - enrichment.audioCoverage (placeholder: % lineup artists with any centroids)
 * Skips events already enriched unless --force provided OR lineupHash changed.
 *
 * ENV:
 *  MONGODB_URI (required)
 *  MONGODB_DB  (optional)
 *  BATCH_SIZE  (optional, default 500)
 *  DRY_RUN=1   (no writes)
 *  FORCE_ENRICH=1 (recompute even if appears complete)
 */

const { MongoClient } = require('mongodb');
const crypto = require('crypto');

function stableHash(arr) {
  return crypto.createHash('sha1').update(JSON.stringify(arr.sort())).digest('hex').slice(0,16);
}

async function main(){
  const uri = process.env.MONGODB_URI;
  if(!uri){ console.error('MONGODB_URI required'); process.exit(1);}  
  const dbName = process.env.MONGODB_DB || process.env.MONGODB_DBNAME;
  const batchSize = +(process.env.BATCH_SIZE || 500);
  const dryRun = process.env.DRY_RUN === '1';
  const force = process.env.FORCE_ENRICH === '1';

  const client = new MongoClient(uri, { maxPoolSize: 5 });
  const summary = { updated:0, examined:0, skippedComplete:0, start: new Date().toISOString(), durationMs:null };

  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    const events = db.collection('events_unified');
    const artists = db.collection('artistGenres');

    // Cursor: only future events (date >= now - 1 day buffer) with lineupArtistIds present
    const cursor = events.find({ 'enrichment.lineupArtistIds': { $exists:true, $ne: [] } }, { projection: { 'enrichment.lineupArtistIds':1, 'enrichment.lineupHash':1, 'enrichment.edmScore':1, 'enrichment.normalizedGenres':1, date:1 } });

    const bulk = [];
    while(await cursor.hasNext()){
      const doc = await cursor.next();
      summary.examined++;
      const lineupIds = doc.enrichment.lineupArtistIds || [];
      if(!lineupIds.length) continue;

      // Fetch artist subset
      const artistDocs = await artists.find({ _id: { $in: lineupIds } }, { projection: { normalizedGenres:1, edmWeight:1, recentCentroids:1, longTermCentroids:1 } }).toArray();
      if(!artistDocs.length) continue;

      const idListSorted = lineupIds.map(id=>id.toString()).sort();
      const newHash = stableHash(idListSorted);
      const hashChanged = !doc.enrichment.lineupHash || doc.enrichment.lineupHash !== newHash;

      // Determine if skip
      const hasEdmScore = doc.enrichment.edmScore !== null && doc.enrichment.edmScore !== undefined;
      const hasGenres = Array.isArray(doc.enrichment.normalizedGenres) && doc.enrichment.normalizedGenres.length>0;
      if(!force && !hashChanged && hasEdmScore && hasGenres){
        summary.skippedComplete++; continue;
      }

      // Compute normalized genre union
      const genreSet = new Set();
      let edmSum = 0; let edmCount = 0; let artistsWithAnyAudio = 0;
      artistDocs.forEach(a=>{
        (a.normalizedGenres||[]).forEach(g=> genreSet.add(g));
        if(typeof a.edmWeight === 'number') { edmSum += a.edmWeight; edmCount++; }
        if((a.recentCentroids && a.recentCentroids.length) || (a.longTermCentroids && a.longTermCentroids.length)) artistsWithAnyAudio++;
      });
      const normalizedGenres = Array.from(genreSet).slice(0,50); // cap size
      const avgEdmWeight = edmCount ? (edmSum / edmCount) : 0;
      const coverageFraction = edmCount ? (edmCount / lineupIds.length) : 0;
      const edmScore = +(avgEdmWeight * coverageFraction).toFixed(4);
      const audioCoverage = +(artistsWithAnyAudio / lineupIds.length).toFixed(4);

      const update = { 'enrichment.normalizedGenres': normalizedGenres, 'enrichment.edmScore': edmScore, 'enrichment.lineupHash': newHash, 'enrichment.audioCoverage': audioCoverage, 'enrichment.lastEnrichedAt': new Date() };
      bulk.push({ updateOne: { filter: { _id: doc._id }, update: { $set: update } } });

      if(bulk.length === batchSize){
        if(!dryRun){ const res = await events.bulkWrite(bulk, { ordered:false }); summary.updated += res.modifiedCount; }
        bulk.length = 0;
      }
    }

    if(bulk.length && !dryRun){ const res = await events.bulkWrite(bulk, { ordered:false }); summary.updated += res.modifiedCount; }
  } catch(e){
    summary.error = e.message;
    console.error('PH4 enrichment backfill failed:', e);
  } finally {
    summary.durationMs = Date.now() - Date.parse(summary.start);
    console.log('\nPH4_EVENT_ENRICHMENT_SUMMARY');
    console.log(JSON.stringify(summary,null,2));
    try { await client.close(); } catch {}
    if(summary.error) process.exitCode = 1;
  }
}

if(require.main === module){
  main();
}
