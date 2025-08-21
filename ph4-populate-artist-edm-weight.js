#!/usr/bin/env node
/**
 * PH4 POPULATE ARTIST EDM WEIGHT & NORMALIZED GENRES
 * --------------------------------------------------
 * Derives normalizedGenres[] + edmWeight for each artistGenres document.
 * Idempotent: only fills missing normalizedGenres or zero edmWeight unless FORCE_EDM_WEIGHT=1.
 *
 * Weight heuristic (initial MVP):
 *  - Canonical EDM keyword groups with tiered weights.
 *  - edmWeight = clamp( sum(tierWeight) / maxPossible , 0..1 ) with diminishing returns.
 *  - If any strongCore genre present (e.g. 'trance','techno','house','drum and bass','dubstep') baseline >=0.4.
 *  - Add 0.15 for each distinct core family up to 0.75, then 0.05 for each support genre up to 1.0.
 *  - Non-EDM artists remain 0.
 *
 * Normalization:
 *  - Lowercase, trim, remove parenthetical parts, unify separators, alias replacement map.
 *  - Filter obvious noise tokens (e.g. 'seen live','under 2000 listeners').
 *
 * ENV:
 *  MONGODB_URI (required)
 *  MONGODB_DB  (optional)
 *  BATCH_SIZE  (default 500)
 *  DRY_RUN=1   (no writes)
 *  FORCE_EDM_WEIGHT=1 (recompute even if edmWeight>0)
 */
const { MongoClient } = require('mongodb');

const ALIASES = Object.entries({
  'dnb':'drum and bass',
  'drum & bass':'drum and bass',
  'drum n bass':'drum and bass',
  'trap edm':'trap',
  'big room house':'big room',
  'bigroom':'big room',
  'edm':'electronic',
  'electro house':'electro house',
  'electro-house':'electro house',
  'hardstyle':'hardstyle',
  'future house':'future house',
  'future bass':'future bass'
});

const NOISE = new Set(['seen live','under 2000 listeners']);

const CORE = new Set(['house','techno','trance','drum and bass','dubstep','hardstyle','progressive house','deep house']);
const SUPPORT = new Set(['electronic','edm','electro house','future house','future bass','big room','hard trance','psytrance','tech house','bass house','garage','breakbeat','idm','glitch hop','hard techno','progressive trance','uplifting trance']);

function normalize(genre){
  if(!genre) return null;
  let g = genre.toLowerCase();
  g = g.replace(/\([^)]*\)/g,''); // remove parenthetical
  g = g.replace(/[-_/]/g,' ').replace(/\s+/g,' ').trim();
  for (const [k,v] of ALIASES){ if (g===k) { g=v; break; } }
  if (NOISE.has(g)) return null;
  return g;
}

function computeWeight(normalizedSet){
  let weight = 0;
  let coreFamilies = 0;
  for (const g of normalizedSet){
    if (CORE.has(g)) coreFamilies++;
  }
  if (coreFamilies>0) weight = Math.max(weight, 0.4 + Math.min(coreFamilies-1,3)*0.15); // up to 0.85 before support
  // Support adds smaller increments
  let supportHits = 0;
  for (const g of normalizedSet){
    if (SUPPORT.has(g) && !CORE.has(g)) supportHits++;
  }
  if (supportHits>0){
    weight += Math.min( (supportHits)*0.05, 1-weight );
  }
  if (weight>1) weight=1;
  return +weight.toFixed(3);
}

async function main(){
  const uri = process.env.MONGODB_URI; if(!uri){console.error('MONGODB_URI required'); process.exit(1);}  
  const dbName = process.env.MONGODB_DB || process.env.MONGODB_DBNAME;
  const batchSize = +(process.env.BATCH_SIZE || 500);
  const dryRun = process.env.DRY_RUN==='1';
  const force = process.env.FORCE_EDM_WEIGHT==='1';

  const client = new MongoClient(uri, { maxPoolSize:5 });
  const summary = { examined:0, updated:0, skippedHasWeight:0, start:new Date().toISOString(), durationMs:null };
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    const coll = db.collection('artistGenres');

    const query = force ? {} : { $or: [ { edmWeight: { $exists:false } }, { edmWeight:0 } , { normalizedGenres: { $exists:false } } ] };
    const projection = { genres:1, normalizedGenres:1, edmWeight:1 };
    const cursor = coll.find(query, { projection });
    const bulk = [];

    while (await cursor.hasNext()){
      const doc = await cursor.next();
      summary.examined++;
      const existingWeight = typeof doc.edmWeight === 'number' ? doc.edmWeight : 0;
      const existingNorm = Array.isArray(doc.normalizedGenres) ? doc.normalizedGenres : [];
      if (!force && existingWeight>0 && existingNorm.length) { summary.skippedHasWeight++; continue; }
      const rawGenres = Array.isArray(doc.genres) ? doc.genres : [];
      const normSet = new Set();
      for (const g of rawGenres){ const n = normalize(g); if(n) normSet.add(n); }
      if (existingNorm.length) existingNorm.forEach(g=> normSet.add(g));
      const finalNorm = Array.from(normSet).slice(0,25);
      const edmWeight = computeWeight(normSet);
      bulk.push({ updateOne: { filter:{ _id: doc._id }, update: { $set: { normalizedGenres: finalNorm, edmWeight } } } });
      if (bulk.length===batchSize){ if(!dryRun){ const res = await coll.bulkWrite(bulk,{ordered:false}); summary.updated += res.modifiedCount; } bulk.length=0; }
    }
    if (bulk.length && !dryRun){ const res = await coll.bulkWrite(bulk,{ordered:false}); summary.updated += res.modifiedCount; }
  } catch (e){
    summary.error = e.message;
    console.error('populate-artist-edm-weight failed:', e);
  } finally {
    summary.durationMs = Date.now() - Date.parse(summary.start);
    console.log('\nPH4_ARTIST_EDM_WEIGHT_SUMMARY');
    console.log(JSON.stringify(summary,null,2));
    try { await client.close(); } catch{}
    if (summary.error) process.exitCode = 1;
  }
}

if (require.main === module) main();
