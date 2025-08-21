#!/usr/bin/env node
/**
 * PH3 DEDUPE FINALIZE
 * -------------------------------------------------------
 * Deletes documents previously marked with duplicateOf and then creates unique index on eventKey.
 * Safe guards:
 *  - Counts remaining duplicate groups before index creation.
 *  - Aborts unique index if duplicate groups remain.
 * Usage:
 *   node ph3-dedupe-finalize.js            (performs deletion + index create)
 *   DRY_RUN=1 node ph3-dedupe-finalize.js  (no deletion / no index changes)
 */
const { MongoClient } = require('mongodb');

(async () => {
  const start = Date.now();
  const summary = { timestamp: new Date().toISOString(), dryRun: process.env.DRY_RUN === '1', deleted:0, pre:{}, post:{}, indexCreated:false, warnings:[], errors:[] };
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB || process.env.MONGODB_DB || 'test';
  if (!uri) { console.error('MONGODB_URI required'); process.exit(1); }
  const client = new MongoClient(uri, { maxPoolSize: 5 });
  try {
    await client.connect();
    const db = client.db(dbName);
    const coll = db.collection('events_unified');

    // Helper to count duplicate groups
    async function countDuplicateGroups() {
      const agg = await coll.aggregate([
        { $match: { eventKey: { $exists: true, $ne: '' } } },
        { $group: { _id: '$eventKey', c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } },
        { $count: 'dups' }
      ]).toArray();
      return agg[0]?.dups || 0;
    }

    summary.pre.total = await coll.countDocuments();
    summary.pre.marked = await coll.countDocuments({ duplicateOf: { $exists: true } });
    summary.pre.duplicateGroups = await countDuplicateGroups();

    if (summary.pre.marked === 0) {
      summary.warnings.push('No marked duplicates found (duplicateOf) — nothing to delete.');
    }

    if (!summary.dryRun && summary.pre.marked > 0) {
      const delRes = await coll.deleteMany({ duplicateOf: { $exists: true } });
      summary.deleted = delRes.deletedCount;
    }

    summary.post.total = await coll.countDocuments();
    summary.post.duplicateGroups = await countDuplicateGroups();

    // Attempt unique index only if duplicateGroups == 0
    if (summary.post.duplicateGroups === 0) {
      if (!summary.dryRun) {
        try {
          await coll.createIndex({ eventKey:1 }, { unique:true, background:true, name: 'eventKey_unique' });
          summary.indexCreated = true;
        } catch (e) {
          if (e.message && e.message.includes('already exists')) {
            summary.warnings.push('Unique eventKey index already exists.');
          } else {
            summary.errors.push('Failed to create unique eventKey index: ' + e.message);
          }
        }
      } else {
        summary.warnings.push('DRY_RUN active: unique index not created.');
      }
    } else {
      summary.warnings.push(`Duplicate groups remain (${summary.post.duplicateGroups}); skipping unique index creation.`);
    }

    // Record final index state
    try {
      const idx = await coll.listIndexes().toArray();
      summary.post.indexes = idx.filter(i => i.key && (i.key.eventKey === 1 || i.name.includes('eventKey')));
    } catch (e) {
      summary.warnings.push('Index inspection failed: ' + e.message);
    }

  } catch (e) {
    summary.errors.push(e.message);
  } finally {
    try { await client.close(); } catch {}
    summary.durationMs = Date.now() - start;
    console.log('PH3_DEDUPE_FINALIZE_SUMMARY');
    console.log(JSON.stringify(summary, null, 2));
    if (summary.errors.length) process.exitCode = 1;
  }
})();
