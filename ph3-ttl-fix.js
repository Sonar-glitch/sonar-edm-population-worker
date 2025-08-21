#!/usr/bin/env node
/**
 * PH3 TTL FIX SCRIPT
 * Sets proper expiresAt field values and (re)creates TTL index with chosen retention.
 * Usage:
 *   PROFILE_TTL_DAYS=90 node ph3-ttl-fix.js
 */
const { MongoClient } = require('mongodb');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) { console.error('MONGODB_URI required'); process.exit(1); }
  const dbName = process.env.MONGO_DB || process.env.MONGODB_DB || 'test';
  const ttlDays = +(process.env.PROFILE_TTL_DAYS || 30);
  const ttlSeconds = ttlDays * 86400;
  const client = new MongoClient(uri);
  const summary = { ttlDays, ttlSeconds, updatedExpiresAt:0, recreatedIndex:false, warnings:[], errors:[] };
  try {
    await client.connect();
    const db = client.db(dbName);
    const coll = db.collection('user_sound_profiles');

    // Backfill expiresAt where missing or misconfigured (<= now)
    const targetDate = new Date(Date.now() + ttlSeconds*1000);
    const res = await coll.updateMany({ $or: [ { expiresAt: { $exists: false } }, { expiresAt: { $lt: new Date() } } ] }, { $set: { expiresAt: targetDate } });
    summary.updatedExpiresAt = res.modifiedCount;

    // Inspect existing TTL index
    const idx = await coll.listIndexes().toArray();
    const ttlIdx = idx.find(i => i.key && i.key.expiresAt === 1);
    if (ttlIdx) {
      if (ttlIdx.expireAfterSeconds !== ttlSeconds) {
        // Need to drop & recreate
        try { await coll.dropIndex(ttlIdx.name); } catch (e) { summary.warnings.push('Failed to drop existing TTL index: '+e.message); }
      } else {
        summary.recreatedIndex = false;
        console.log('TTL index already matches desired retention.');
      }
    }
    // Ensure correct TTL index
    const finalIdx = await coll.listIndexes().toArray();
    const hasCorrect = finalIdx.some(i => i.key && i.key.expiresAt === 1 && i.expireAfterSeconds === ttlSeconds);
    if (!hasCorrect) {
      try {
        await coll.createIndex({ expiresAt:1 }, { expireAfterSeconds: ttlSeconds, name: 'user_profile_ttl', background:true });
        summary.recreatedIndex = true;
      } catch (e) {
        summary.errors.push('Failed to create TTL index: '+e.message);
      }
    }
  } catch (e) {
    summary.errors.push(e.message);
  } finally {
    console.log('PH3_TTL_FIX_SUMMARY');
    console.log(JSON.stringify(summary,null,2));
    try { await client.close(); } catch {}
    if (summary.errors.length) process.exitCode = 1;
  }
})();
