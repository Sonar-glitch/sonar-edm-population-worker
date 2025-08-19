#!/usr/bin/env node
/**
 * Pipeline Smoke Test
 * Goal: Rapidly assess current operational status across data, enrichment, Essentia service,
 * and readiness for EDM user taste-centric event recommendations.
 *
 * Usage:
 *   node pipeline-smoke-test.js --mongo MONGODB_URI [--db DB_NAME] [--limit 100] [--edmGenresFile edm_genres.json]
 *
 * Outputs concise JSON summary plus human-readable section log.
 * Does NOT mutate data.
 */

const { MongoClient } = require('mongodb');
const https = require('https');
const http = require('http');
const { URL } = require('url');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { limit: 100 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mongo') out.mongo = args[++i];
    else if (a === '--db') out.dbName = args[++i];
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--edmGenresFile') out.edmGenresFile = args[++i];
  }
  return out;
}

function unique(arr) { return [...new Set(arr.filter(Boolean))]; }

async function fetchEssentiaHealth(urlStr) {
  if (!urlStr) return { reachable: false, error: 'NO_URL' };
  try {
    const url = new URL(urlStr.replace(/\/$/, '') + '/health');
    const lib = url.protocol === 'https:' ? https : http;
    return await new Promise((resolve) => {
      const req = lib.get(url, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch { /* ignore */ }
          resolve({ reachable: true, statusCode: res.statusCode, body: parsed || body.slice(0,200) });
        });
      });
      req.setTimeout(8000, () => { req.destroy(); resolve({ reachable: false, timeout: true }); });
      req.on('error', (err) => resolve({ reachable: false, error: err.message }));
    });
  } catch (e) {
    return { reachable: false, error: e.message };
  }
}

async function main() {
  const args = parseArgs();
  const mongoUri = args.mongo || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Missing --mongo or MONGODB_URI');
    process.exit(1);
  }

  const client = new MongoClient(mongoUri, { maxPoolSize: 3 });
  let db;
  const started = Date.now();
  const summary = { startedAt: new Date(started).toISOString(), durationMs: null, data: {}, warnings: [], recommendations: [] };

  try {
    await client.connect();
    db = client.db(args.dbName); // may be undefined -> driver uses default from URI

    // Collections heuristics
    const collections = await db.listCollections().toArray();
    const colNames = collections.map(c => c.name);

    function has(name) { return colNames.includes(name); }

    // Basic counts
    const eventsCol = has('events_unified') ? db.collection('events_unified') : null;
    const artistsCol = has('artistGenres') ? db.collection('artistGenres') : null;
    const profilesCol = has('user_sound_profiles') ? db.collection('user_sound_profiles') : null;
    const trackMatricesCol = has('audioTrackMatrices') ? db.collection('audioTrackMatrices') : null;

    if (!eventsCol) summary.warnings.push('events_unified collection missing');
    if (!artistsCol) summary.warnings.push('artistGenres collection missing (enrichment pending)');

    const [eventCount, artistCount, trackMatrixCount, profileCount] = await Promise.all([
      eventsCol ? eventsCol.estimatedDocumentCount() : 0,
      artistsCol ? artistsCol.estimatedDocumentCount() : 0,
      trackMatricesCol ? trackMatricesCol.estimatedDocumentCount() : 0,
      profilesCol ? profilesCol.estimatedDocumentCount() : 0,
    ]);

    summary.data.counts = { events_unified: eventCount, artistGenres: artistCount, audioTrackMatrices: trackMatrixCount, user_sound_profiles: profileCount };

    // Sample EDM relevance stats
    let edmKeywords = ['edm','techno','trance','house','progressive house','drum and bass','dnb','dubstep','electro','electronic','hardstyle'];
    if (args.edmGenresFile) {
      try { edmKeywords = require(require('path').resolve(args.edmGenresFile)); } catch (e) { summary.warnings.push('Failed to load edmGenresFile: ' + e.message); }
    }

    let sampleEvents = [];
    if (eventsCol) {
      sampleEvents = await eventsCol.find({}, { projection: { name:1, artistList:1, genres:1 }, limit: args.limit }).toArray();
    }

    // Build artist -> genres map (subset)
    const artistIds = unique(sampleEvents.flatMap(e => (e.artistList || []).map(a => a.spotifyId || a.id)).filter(Boolean)).slice(0, 1000);
    let artistGenreDocs = [];
    if (artistIds.length && artistsCol) {
      artistGenreDocs = await artistsCol.find({ $or: [ { spotifyId: { $in: artistIds } }, { artistId: { $in: artistIds } } ] }, { projection: { name:1, genres:1, spotifyId:1, artistId:1 } }).toArray();
    }
    const artistGenreIndex = {};
    artistGenreDocs.forEach(a => { const key = a.spotifyId || a.artistId; artistGenreIndex[key] = (a.genres || []).map(g => g.toLowerCase()); });

    function eventEDMScore(ev) {
      const lineup = (ev.artistList || []).map(a => a.spotifyId || a.id);
      let hits = 0, total = 0;
      lineup.forEach(id => {
        total++;
        const g = artistGenreIndex[id] || [];
        if (g.some(gg => edmKeywords.includes(gg))) hits++;
      });
      return total ? hits / total : 0;
    }

    const edmScores = sampleEvents.map(ev => eventEDMScore(ev));
    edmScores.sort((a,b)=>a-b);
    function pct(p) { return edmScores.length ? edmScores[Math.min(edmScores.length-1, Math.floor(p * edmScores.length))] : 0; }

    summary.data.edmCoverage = {
      sampleSize: sampleEvents.length,
      avgScore: edmScores.reduce((a,b)=>a+b,0)/(edmScores.length||1),
      p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), max: edmScores[edmScores.length-1] || 0,
      zeroLineupEvents: sampleEvents.filter(ev => !ev.artistList || ev.artistList.length===0).length
    };

    if (artistCount < 500 && eventCount > 0) summary.recommendations.push('Run Spotify artist enrichment to expand artistGenres beyond current count');
    if (trackMatrixCount === 0) summary.recommendations.push('Begin Essentia analysis: run build-essentia-audio-matrix.js on enriched artists');
    if (profilesCol && profileCount === 0) summary.recommendations.push('Trigger user taste collection to generate user_sound_profiles');
    if (summary.data.edmCoverage.avgScore < 0.4) summary.recommendations.push('Improve EDM targeting: expand genre normalization & ensure lineup enrichment');

    // Essentia service health
    const essentiaHealth = await fetchEssentiaHealth(process.env.ESSENTIA_SERVICE_URL || process.env.ESSENTIA_URL || 'https://tiko-essentia-audio-service-2eff1b2af167.herokuapp.com');
    summary.data.essentia = essentiaHealth;

    summary.durationMs = Date.now() - started;

    // Human-readable output
    console.log('--- PIPELINE SMOKE TEST ---');
    console.log('Counts:', summary.data.counts);
    console.log('EDM Coverage (avg, p50, p75, p90, max):', summary.data.edmCoverage.avgScore.toFixed(2), summary.data.edmCoverage.p50.toFixed(2), summary.data.edmCoverage.p75.toFixed(2), summary.data.edmCoverage.p90.toFixed(2), summary.data.edmCoverage.max.toFixed(2));
    console.log('Zero-lineup events in sample:', summary.data.edmCoverage.zeroLineupEvents);
    console.log('Essentia health:', essentiaHealth);
    if (summary.warnings.length) console.log('Warnings:', summary.warnings);
    if (summary.recommendations.length) console.log('Recommendations:', summary.recommendations);
    console.log('\nJSON_SUMMARY_START');
    console.log(JSON.stringify(summary, null, 2));
    console.log('JSON_SUMMARY_END');
  } catch (e) {
    console.error('Smoke test failed:', e);
    process.exitCode = 2;
  } finally {
    await client.close().catch(()=>{});
  }
}

if (require.main === module) {
  main();
}
