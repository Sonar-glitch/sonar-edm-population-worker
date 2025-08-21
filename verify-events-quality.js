#!/usr/bin/env node
/**
 * PH4 VERIFY EVENTS QUALITY
 * -------------------------------------------------------
 * Samples up to N future events and computes enrichment quality metrics:
 *  - lineupCoveragePercent (events with enrichment.lineupArtistIds >0)
 *  - edmScore coverage + p50 / p90 / mean
 *  - audioCoverage mean / p50 / p90 (for events with edmScore)
 *  - emptyLineupCount
 *  - centroidAvailabilityPercent (events with lineupCentroids length>0)
 * Outputs JSON summary (PH4_EVENTS_QUALITY_SUMMARY).
 *
 * ENV:
 *   MONGODB_URI (required)
 *   MONGODB_DB (optional)
 *   SAMPLE_LIMIT (default 500)
 */
const { MongoClient } = require('mongodb');

function percentile(sorted, p){
  if(!sorted.length) return null; if(p<=0) return sorted[0]; if(p>=1) return sorted[sorted.length-1];
  const idx = (sorted.length-1)*p; const lo = Math.floor(idx); const hi = Math.ceil(idx);
  if(lo===hi) return sorted[lo];
  return sorted[lo] + (sorted[hi]-sorted[lo])*(idx-lo);
}

(async function(){
  const uri = process.env.MONGODB_URI; if(!uri){ console.error('MONGODB_URI required'); process.exit(1);}  
  const dbName = process.env.MONGODB_DB || process.env.MONGODB_DBNAME;
  const limit = +(process.env.SAMPLE_LIMIT || 500);
  const client = new MongoClient(uri, { maxPoolSize:5 });
  const summary = { sampleSize:0, lineupCoveragePercent:0, edmScore:{coveragePercent:0, mean:null,p50:null,p90:null}, audioCoverage:{mean:null,p50:null,p90:null}, emptyLineupCount:0, centroidAvailabilityPercent:0, timestamp:new Date().toISOString(), durationMs:null };
  const start = Date.now();
  try {
    await client.connect();
    const db = dbName ? client.db(dbName) : client.db();
    const now = new Date();
    const cursor = db.collection('events_unified').find({ date: { $gte: now } }, { projection: { 'enrichment.lineupArtistIds':1, 'enrichment.edmScore':1, 'enrichment.audioCoverage':1, 'enrichment.lineupCentroids':1, date:1 } }).sort({ date:1 }).limit(limit);
    const edmScores=[]; const audioCov=[]; let withLineup=0; let withCentroids=0; let total=0; let emptyLineup=0;
    while(await cursor.hasNext()){
      const doc = await cursor.next(); total++;
      const lineup = doc.enrichment?.lineupArtistIds || [];
      if(lineup.length>0) withLineup++; else emptyLineup++;
      const centroids = doc.enrichment?.lineupCentroids || [];
      if(centroids.length>0) withCentroids++;
      const score = doc.enrichment?.edmScore;
      if(score !== null && score !== undefined){ edmScores.push(score); if(typeof doc.enrichment?.audioCoverage === 'number') audioCov.push(doc.enrichment.audioCoverage); }
    }
    summary.sampleSize = total;
    summary.emptyLineupCount = emptyLineup;
    summary.lineupCoveragePercent = total ? +(withLineup/total*100).toFixed(2) : 0;
    summary.centroidAvailabilityPercent = total ? +(withCentroids/total*100).toFixed(2) : 0;
    edmScores.sort((a,b)=>a-b); audioCov.sort((a,b)=>a-b);
    const edmCoveragePercent = total ? +(edmScores.length/total*100).toFixed(2) : 0;
    summary.edmScore.coveragePercent = edmCoveragePercent;
    if(edmScores.length){
      const mean = edmScores.reduce((a,b)=>a+b,0)/edmScores.length;
      summary.edmScore.mean = +mean.toFixed(4);
      summary.edmScore.p50 = +percentile(edmScores,0.5).toFixed(4);
      summary.edmScore.p90 = +percentile(edmScores,0.9).toFixed(4);
    }
    if(audioCov.length){
      const meanA = audioCov.reduce((a,b)=>a+b,0)/audioCov.length;
      summary.audioCoverage.mean = +meanA.toFixed(4);
      summary.audioCoverage.p50 = +percentile(audioCov,0.5).toFixed(4);
      summary.audioCoverage.p90 = +percentile(audioCov,0.9).toFixed(4);
    }
  } catch(e){
    summary.error = e.message;
    console.error('verify-events-quality failed:', e);
  } finally {
    summary.durationMs = Date.now()-start;
    console.log('\nPH4_EVENTS_QUALITY_SUMMARY');
    console.log(JSON.stringify(summary,null,2));
    try { await client.close(); } catch{}
    if(summary.error) process.exitCode = 1;
  }
})();
