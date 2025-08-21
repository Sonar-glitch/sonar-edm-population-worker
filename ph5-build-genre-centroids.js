#!/usr/bin/env node
/**
 * PH5 BUILD GENRE / EDM CENTROIDS
 * --------------------------------
 * Computes feature centroids from artistGenres. Initial MVP builds:
 *  - globalEdm: centroid of all artists with edmWeight>0 (weighted by edmWeight)
 *  - coreHouse / coreTechno / coreTrance / coreDnB / coreDubstep (if >= MIN_ARTISTS each)
 *  - Additional future: cluster-based multi-centroids (placeholder hooks included)
 *
 * Stores results in collection: edm_centroids
 * Document shape:
 *   { _id: 'globalEdm', size: N, updatedAt, features: { energy:..., valence:..., ... }, weightSum }
 *
 * Idempotent: upserts each centroid by _id. Safe to re-run.
 *
 * ENV:
 *  MONGODB_URI (required)
 *  MONGODB_DB  (optional)
 *  DRY_RUN=1 (no writes)
 *  MIN_ARTISTS (default 25 for category centroids)
 */
const { MongoClient } = require('mongodb');

const CORE_TAGS = {
  coreHouse: ['house','deep house','progressive house','tech house','bass house','future house'],
  coreTechno: ['techno','hard techno','minimal techno'],
  coreTrance: ['trance','uplifting trance','progressive trance','psytrance','hard trance'],
  coreDnB: ['drum and bass','dnb'],
  coreDubstep: ['dubstep']
};

const FEATURE_PATH = 'essentiaAudioProfile.aggregate'; // assumed pre-computed aggregate features
const FEATURE_KEYS = ['danceability','energy','valence','acousticness','instrumentalness','liveness','speechiness','tempo','bpm','loudness'];

function accumulate(acc, feat, weight){
  if(!feat) return;
  FEATURE_KEYS.forEach(k=>{
    const v = typeof feat[k] === 'number' ? feat[k] : null;
    if (v==null || isNaN(v)) return;
    acc[k] = (acc[k]||0) + v*weight;
  });
}
function finalize(acc, weightSum){
  const out={};
  FEATURE_KEYS.forEach(k=>{ if (weightSum>0 && acc[k]!=null) out[k] = +(acc[k]/weightSum).toFixed(5); });
  return out;
}

async function build(){
  const uri = process.env.MONGODB_URI; if(!uri){ console.error('MONGODB_URI required'); process.exit(1);}  
  const dbName = process.env.MONGODB_DB || process.env.MONGODB_DBNAME;
  const dryRun = process.env.DRY_RUN==='1';
  const minArtists = +(process.env.MIN_ARTISTS||25);

  const client = new MongoClient(uri,{ maxPoolSize:5 });
  const summary = { start:new Date().toISOString(), processed:0, centroids:[], skippedGroups:[], error:null };
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    const artists = db.collection('artistGenres');
    const centroidColl = db.collection('edm_centroids');

    // Global EDM centroid
    const cursor = artists.find({ edmWeight: { $gt: 0 }, [FEATURE_PATH]: { $exists: true } }, { projection: { edmWeight:1, [FEATURE_PATH]:1, normalizedGenres:1 } });

    let weightSum=0; const acc={}; let size=0;
    while (await cursor.hasNext()){
      const doc = await cursor.next();
      size++;
      const feat = doc.essentiaAudioProfile?.aggregate;
      const w = doc.edmWeight || 0.5;
      accumulate(acc, feat, w);
      weightSum += w;
    }
    const globalFeatures = finalize(acc, weightSum);
    summary.centroids.push({ id:'globalEdm', size, weightSum });
    if (!dryRun){
      await centroidColl.updateOne({ _id:'globalEdm' }, { $set: { _id:'globalEdm', size, weightSum, features: globalFeatures, updatedAt: new Date() } }, { upsert:true });
    }

    // Core group centroids
    for (const [id, tags] of Object.entries(CORE_TAGS)){
      const query = { edmWeight: { $gt: 0 }, normalizedGenres: { $in: tags }, [FEATURE_PATH]: { $exists: true } };
      const docs = await artists.find(query, { projection: { edmWeight:1, [FEATURE_PATH]:1 } }).toArray();
      if (docs.length < minArtists){ summary.skippedGroups.push({ id, reason:`<${minArtists} artists (${docs.length})` }); continue; }
      let wSum=0; const a={};
      docs.forEach(d=>{ const w=d.edmWeight||0.5; accumulate(a, d.essentiaAudioProfile.aggregate, w); wSum+=w; });
      const feats = finalize(a,wSum);
      summary.centroids.push({ id, size:docs.length, weightSum:wSum });
      if(!dryRun){
        await centroidColl.updateOne({ _id:id }, { $set: { _id:id, size:docs.length, weightSum:wSum, features:feats, tags, updatedAt:new Date() } }, { upsert:true });
      }
    }

    // Placeholder for future clustering (multi-centroid) - record stub doc once
    if(!dryRun){
      await centroidColl.updateOne({ _id:'clusterMeta' }, { $setOnInsert: { _id:'clusterMeta', notes:'Future: KMeans/UMAP clusters of EDM artist feature space', createdAt:new Date() } }, { upsert:true });
    }
  } catch(e){
    summary.error = e.message;
    console.error('build-genre-centroids failed:', e);
  } finally {
    summary.durationMs = Date.now() - Date.parse(summary.start);
    console.log('\nPH5_CENTROIDS_SUMMARY');
    console.log(JSON.stringify(summary,null,2));
    try { await client.close(); } catch{}
    if(summary.error) process.exitCode=1;
  }
}

if (require.main === module) build();
