#!/usr/bin/env node
/**
 * PH3 DEDUPE ANALYSIS + OPTIONAL CONSOLIDATION
 * -------------------------------------------------------
 * Purpose: Analyze duplicate eventKey groups produced in PH3 migration and optionally mark or remove duplicates
 * Usage:
 *   node ph3-dedupe-analyze.js              -> analysis only (no writes)
 *   APPLY_DEDUPE=1 node ph3-dedupe-analyze.js     -> mark duplicates with duplicateOf + dedupeMeta
 *   APPLY_DEDUPE=1 DELETE_DUPES=1 node ph3-dedupe-analyze.js  -> also physically remove duplicate docs (keeping canonical)
 *
 * Strategy:
 *  - For each eventKey group with count>1, choose canonical doc by heuristic:
 *      1. Prefer doc with earliest date field if dates differ
 *      2. Else prefer doc with richest artistList length
 *      3. Else earliest _id timestamp
 *  - Mark all others: { duplicateOf: canonicalId, dedupeMeta: { ts, reason, originalSourceIds } }
 *  - Optional delete in second pass (safety first)
 *  - Summary JSON emitted for health tracking
 */

const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('MONGODB_URI required');
  process.exit(1);
}
const dbName = process.env.MONGO_DB || process.env.MONGODB_DB || 'test';
const APPLY = process.env.APPLY_DEDUPE === '1';
const DELETE_DUPES = process.env.DELETE_DUPES === '1';
const CANONICAL_STRATEGY = (process.env.CANONICAL_STRATEGY || 'latest').toLowerCase(); // 'latest' | 'richest'

function objectIdTime(oid) {
  try { return new Date(parseInt(oid.toString().substring(0,8),16)*1000); } catch { return new Date(); }
}

(async () => {
  const start = Date.now();
  const client = new MongoClient(uri, { maxPoolSize: 5 });
  const summary = { timestamp: new Date().toISOString(), apply: APPLY, delete: DELETE_DUPES, groupsProcessed:0, groupsAnalyzed:0, duplicatesMarked:0, duplicatesDeleted:0, warnings:[], sample: [] };
  try {
    await client.connect();
    const db = client.db(dbName);
    const coll = db.collection('events_unified');

    // Aggregate duplicate groups (limited for memory safety)
    const dupGroups = await coll.aggregate([
      { $match: { eventKey: { $exists: true, $ne: '' } } },
      { $group: { _id: '$eventKey', c: { $sum: 1 } } },
      { $match: { c: { $gt: 1 } } },
      { $sort: { c: -1 } },
      { $limit: 5000 } // cap for analysis
    ]).toArray();

    summary.groupsAnalyzed = dupGroups.length;

    for (const g of dupGroups) {
      const docs = await coll.find({ eventKey: g._id }).project({ name:1, date:1, venue:1, venueName:1, artistList:1, source:1, sourceId:1, createdAt:1 }).toArray();
      if (docs.length < 2) continue;
      summary.groupsProcessed++;

      // Canonical selection strategies
      let canonical;
      let duplicates;
      if (CANONICAL_STRATEGY === 'richest') {
        const scored = docs.map(d => ({
          d,
          artistCount: Array.isArray(d.artistList) ? d.artistList.length : 0,
          oidTime: objectIdTime(d._id)
        })).sort((a,b)=> {
          if (b.artistCount !== a.artistCount) return b.artistCount - a.artistCount;
          return b.oidTime - a.oidTime; // latest tie-break
        });
        canonical = scored[0].d;
        duplicates = scored.slice(1).map(s=>s.d);
      } else { // latest (default)
        const scored = docs.map(d => ({ d, oidTime: objectIdTime(d._id), artistCount: Array.isArray(d.artistList)? d.artistList.length:0 }));
        scored.sort((a,b)=> b.oidTime - a.oidTime || b.artistCount - a.artistCount); // newest first, then richer
        canonical = scored[0].d;
        duplicates = scored.slice(1).map(s=>s.d);
      }
      if (!APPLY) {
        if (summary.sample.length < 25) {
          summary.sample.push({ eventKey: g._id, count: g.c, canonicalId: canonical._id, duplicateIds: duplicates.map(x=>x._id) });
        }
        continue; // analysis only
      }

      // Merge enrichment/data fields from duplicates into canonical BEFORE marking
      if (duplicates.length) {
        const merge = {};
        // Helper to union arrays (primitive / object via JSON signature)
        function unionArrays(existing, incoming) {
          const a = Array.isArray(existing) ? existing.slice() : [];
            (Array.isArray(incoming) ? incoming : []).forEach(item => {
              const sig = (item && typeof item === 'object') ? JSON.stringify(item) : item;
              const has = a.some(x => ((x && typeof x === 'object') ? JSON.stringify(x) : x) === sig);
              if (!has) a.push(item);
            });
          return a;
        }
        // Artist list
        let combinedArtistList = canonical.artistList || [];
        duplicates.forEach(d => { combinedArtistList = unionArrays(combinedArtistList, d.artistList); });
        if (combinedArtistList.length !== (canonical.artistList || []).length) merge.artistList = combinedArtistList;

        // Enrichment subfields
        const enrichmentUnion = {};
        const enrichmentFields = ['lineupArtistIds','normalizedGenres','lineupCentroids'];
        enrichmentFields.forEach(f => {
          let combined = (canonical.enrichment?.[f]) || [];
          duplicates.forEach(d => { if (d.enrichment?.[f]) combined = unionArrays(combined, d.enrichment[f]); });
          if (combined.length !== ((canonical.enrichment?.[f])||[]).length) {
            enrichmentUnion[f] = combined;
          }
        });
        // Scalar enrichment picks (max values or most recent)
        function pickMax(field) {
          let current = canonical.enrichment?.[field];
          duplicates.forEach(d => { if (d.enrichment && d.enrichment[field] != null) { if (current == null || d.enrichment[field] > current) current = d.enrichment[field]; } });
          return current;
        }
        function pickLatestDate(field) {
          let current = canonical.enrichment?.[field];
          duplicates.forEach(d => { const val = d.enrichment?.[field]; if (val) { if (!current || new Date(val) > new Date(current)) current = val; } });
          return current;
        }
        const edmScore = pickMax('edmScore');
        const audioCoverage = pickMax('audioCoverage');
        const featuresVersion = pickMax('featuresVersion');
        const lastEnrichedAt = pickLatestDate('lastEnrichedAt');
        const lineupHash = pickMax('lineupHash'); // assumes lexicographically "larger" or higher hashed value is newer (acceptable heuristic)
        ['edmScore','audioCoverage','featuresVersion','lastEnrichedAt','lineupHash'].forEach(f => {
          if (eval(f) != null && (canonical.enrichment?.[f]) !== eval(f)) enrichmentUnion[f] = eval(f);
        });
        if (Object.keys(enrichmentUnion).length) merge['enrichment'] = { ...(canonical.enrichment||{}), ...enrichmentUnion };

        if (Object.keys(merge).length) {
          await coll.updateOne({ _id: canonical._id }, { $set: merge });
        }

        // Mark duplicates
        const dupIds = duplicates.map(d=>d._id);
        const res = await coll.updateMany({ _id: { $in: dupIds } }, { $set: { duplicateOf: canonical._id, dedupeMeta: { ts: new Date(), reason: `eventKey canonical selection (${CANONICAL_STRATEGY})`, originalSourceIds: duplicates.map(d=>d.sourceId).filter(Boolean) } } });
        summary.duplicatesMarked += res.modifiedCount;
        if (DELETE_DUPES) {
          const del = await coll.deleteMany({ _id: { $in: dupIds } });
          summary.duplicatesDeleted += del.deletedCount;
        }
      }
    }

    // Post-dedupe suggestion
    if (APPLY && !DELETE_DUPES) {
      summary.warnings.push('Duplicates marked but not deleted (DELETE_DUPES=1 to remove)');
    }

    if (!APPLY) {
      summary.warnings.push('Run with APPLY_DEDUPE=1 to mark duplicates before enabling unique index');
    }

  } catch (e) {
    summary.error = e.message;
    console.error('Dedupe analysis failed:', e);
  } finally {
    await client.close().catch(()=>{});
    summary.durationMs = Date.now() - start;
    console.log('\nPH3_DEDUPE_SUMMARY');
    console.log(JSON.stringify(summary, null, 2));
    if (summary.error) process.exitCode = 1;
  }
})();
