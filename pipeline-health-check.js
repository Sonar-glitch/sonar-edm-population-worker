#!/usr/bin/env node
/**
 * PIPELINE HEALTH CHECK (END-TO-END)
 * Worker-Scope Version
 * ---------------------------------
 * Verifies status of each validated architecture phase:
 * 1. Database foundations (events_unified, counts, dedup ratios)
 * 2. Artist extraction readiness (artistGenres baseline)
 * 3. Spotify enrichment readiness (credentials + token test)
 * 4. Essentia service health & coverage (essentiaAudioProfile presence)
 * 5. User sound profile cache health (user_sound_profiles freshness/indexes)
 * 6. Optional API smoke tests (if DASHBOARD_BASE_URL provided)
 *
 * Output: Single JSON summary + human-readable sectioned report
 * NOTE: Lives inside worker (correct domain). Root copy removed.
 */

import('node-fetch').then(async ({ default: fetch }) => {
  const { MongoClient } = require('mongodb');
  const SpotifyWebApi = require('spotify-web-api-node');
  const start = Date.now();

  const summary = {
    timestamp: new Date().toISOString(),
    phases: {},
    warnings: [],
    errors: [],
    metrics: {}
  };

  function section(title) {
    console.log('\n' + title);
    console.log('='.repeat(title.length));
  }

  // Use worker-standard env names
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  const DB_NAME = process.env.MONGO_DB || process.env.MONGODB_DB || 'test';
  const ESSENTIA_SERVICE_URL = process.env.ESSENTIA_SERVICE_URL || 'https://tiko-essentia-audio-service-2eff1b2af167.herokuapp.com';
  const MIN_REAL_TRACKS = +(process.env.MIN_REAL_TRACKS || 5);
  const DASHBOARD_SESSION_COOKIE = process.env.DASHBOARD_SESSION_COOKIE; // e.g. "next-auth.session-token=..." OR full cookie string
  const HEALTH_HISTORY = process.env.HEALTH_HISTORY === '1';
  const HEALTH_ASSERT_DEMO = (process.env.HEALTH_ASSERT_DEMO || 'true').toLowerCase() === 'true';

  let client;
  try {
    if (!MONGO_URI) {
      section('CONFIG VALIDATION');
      const msg = 'Missing MONGODB_URI environment variable';
      console.error(msg);
      summary.errors.push(msg);
      throw new Error(msg);
    }
    section('1. Database Foundations');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    const eventsCollection = db.collection('events_unified');
    const eventsUnifiedCount = await eventsCollection.countDocuments();
    const eventsCount = await db.collection('events').countDocuments().catch(() => 0);

    console.log(`events_unified: ${eventsUnifiedCount}`);
    console.log(`events (legacy/supplementary): ${eventsCount}`);

    // eventKey coverage & duplicate detection (sample / aggregate)
    let eventKeyMissing = 0;
    let eventKeyDuplicateGroups = 0;
    let lineupHashCoverage = 0;
    try {
      // Count missing eventKey
      eventKeyMissing = await eventsCollection.countDocuments({ $or: [ { eventKey: { $exists: false } }, { eventKey: null }, { eventKey: '' } ] });
      // Duplicate groups
      const dupAgg = await eventsCollection.aggregate([
        { $match: { eventKey: { $exists: true, $ne: '' } } },
        { $group: { _id: '$eventKey', c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } },
        { $count: 'dups' }
      ]).toArray();
      eventKeyDuplicateGroups = dupAgg[0]?.dups || 0;
      // lineupHash coverage (enrichment started indicator)
      lineupHashCoverage = await eventsCollection.countDocuments({ 'enrichment.lineupHash': { $exists: true, $ne: null } });
    } catch (e) {
      summary.warnings.push('eventKey/lineupHash aggregation failed: ' + e.message);
    }

    const eventKeyCoveragePercent = eventsUnifiedCount ? +(((eventsUnifiedCount - eventKeyMissing)/eventsUnifiedCount)*100).toFixed(2) : 0;
    const lineupHashCoveragePercent = eventsUnifiedCount ? +((lineupHashCoverage/eventsUnifiedCount)*100).toFixed(2) : 0;

    if (eventKeyCoveragePercent < 95) summary.warnings.push(`eventKey coverage low: ${eventKeyCoveragePercent}%`);
    if (eventKeyDuplicateGroups > 0) summary.warnings.push(`Duplicate eventKey groups detected: ${eventKeyDuplicateGroups}`);

    summary.phases.database = {
      events_unified: eventsUnifiedCount,
      events: eventsCount,
      eventKeyCoveragePercent,
      eventKeyDuplicateGroups,
      lineupHashCoveragePercent,
      status: (eventsUnifiedCount > 8000 && eventKeyCoveragePercent >= 98 && eventKeyDuplicateGroups === 0) ? 'ok' : 'attention'
    };

    const sample = await db.collection('events_unified').findOne({}, { projection: { name:1, date:1, sourceId:1, artistList:1 } });
    if (!sample?.name || !sample?.date || !sample?.sourceId) {
      summary.warnings.push('Sample event missing critical fields');
    }

    // Index presence checks (events_unified)
    try {
      const evIdx = await eventsCollection.listIndexes().toArray();
      const hasEventKeyUnique = evIdx.some(i => i.key && i.key.eventKey === 1 && i.unique);
      const hasDateEdmScore = evIdx.some(i => i.key && i.key.date === 1 && (i.key['enrichment.edmScore'] === -1 || i.key['enrichment.edmScore'] === 1));
      summary.phases.database.indexes = { eventKeyUnique: hasEventKeyUnique, dateEdmScore: hasDateEdmScore };
      if (!hasEventKeyUnique) summary.warnings.push('Missing unique index on events_unified.eventKey');
      if (!hasDateEdmScore) summary.warnings.push('Missing date + enrichment.edmScore index');
    } catch (e) {
      summary.warnings.push('Index inspection failed: ' + e.message);
    }

    section('2. Artist Extraction & Enrichment Readiness');
    const artistGenresCount = await db.collection('artistGenres').countDocuments().catch(()=>0);
    console.log(`artistGenres: ${artistGenresCount}`);
    const enrichedSample = await db.collection('artistGenres').findOne({ spotifyId: { $ne: null } }, { projection: { name:1, genres:1 } });
    const essentiaCoverage = await db.collection('artistGenres').countDocuments({ 'essentiaAudioProfile.trackMatrix': { $exists: true } }).catch(()=>0);

    summary.phases.artist = {
      artistGenres: artistGenresCount,
      spotifyEnriched: !!enrichedSample,
      essentiaProfiles: essentiaCoverage,
      status: artistGenresCount > 100 ? 'ok' : 'baseline'
    };

    if (!enrichedSample) summary.warnings.push('No Spotify-enriched artists yet (run enrichment with credentials)');

    section('3. Spotify Credential Smoke Test');
    const spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    });
    let spotifyAuthOk = false;
    try {
      if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
        const tokenData = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(tokenData.body['access_token']);
        const me = await spotifyApi.getArtist('1vCWHaC5f2uS3yhpwWbIA6');
        spotifyAuthOk = !!me.body?.id;
        console.log('Spotify token + test artist fetch: OK');
      } else {
        console.log('Spotify credentials missing env vars');
      }
    } catch (e) {
      console.log('Spotify credential test failed:', e.message);
      summary.warnings.push('Spotify credential test failed: ' + e.message);
    }
    summary.phases.spotify = { auth: spotifyAuthOk };

    section('4. Essentia Service Health & Coverage');
    let essentiaHealth = false;
    try {
      const health = await fetch(`${ESSENTIA_SERVICE_URL}/health`);
      essentiaHealth = health.ok;
      console.log(`Essentia service: ${health.ok ? 'OK' : 'FAIL'} (${health.status})`);
    } catch (e) {
      console.log('Essentia service request failed:', e.message);
      summary.errors.push('Essentia health check failed: ' + e.message);
    }

    summary.phases.essentia = {
      service: essentiaHealth,
      artistCoverage: essentiaCoverage,
      coveragePercent: artistGenresCount ? +((essentiaCoverage/artistGenresCount)*100).toFixed(1) : 0
    };

    section('5. User Sound Profile Cache');
    const profilesColl = db.collection('user_sound_profiles');
    const profileCount = await profilesColl.countDocuments().catch(()=>0);
    const recentProfiles = await profilesColl.countDocuments({ createdAt: { $gte: new Date(Date.now()-86400000) } }).catch(()=>0);
    console.log(`user_sound_profiles total: ${profileCount}`);
    console.log(`profiles last 24h: ${recentProfiles}`);

    // Stale profiles (>7d old) vs total
    let staleProfiles = 0;
    try {
      staleProfiles = await profilesColl.countDocuments({ createdAt: { $lt: new Date(Date.now()-7*86400000) } });
    } catch (e) {
      summary.warnings.push('Stale profile count failed: ' + e.message);
    }

    summary.phases.userProfiles = {
      total: profileCount,
      last24h: recentProfiles,
      stale7d: staleProfiles,
      stalePercent: profileCount ? +((staleProfiles/profileCount)*100).toFixed(1) : 0,
      status: profileCount > 0 ? 'ok' : 'empty'
    };

    const idx = await profilesColl.listIndexes().toArray();
    const hasTTL = idx.some(i => i.key?.expiresAt && i.expireAfterSeconds);
    if (!hasTTL) summary.warnings.push('Missing TTL index on user_sound_profiles.expiresAt');
    summary.phases.userProfiles.ttlIndex = hasTTL;

    section('6. API Smoke Tests (optional)');
    const apiBase = process.env.DASHBOARD_BASE_URL; // e.g., https://sonar-edm-staging.herokuapp.com
    if (apiBase) {
      try {
        const headers = { 'Accept':'application/json' };
        if (DASHBOARD_SESSION_COOKIE) headers['Cookie'] = DASHBOARD_SESSION_COOKIE;
        const resp = await fetch(`${apiBase}/api/user/cached-dashboard-data`, { headers });
        console.log(`/cached-dashboard-data: ${resp.status}`);
        let apiData = null;
        try { apiData = await resp.json(); } catch { /* ignore */ }
        summary.phases.api = { cachedDashboardData: resp.status };
        if (apiData && typeof apiData === 'object') {
          // Attempt to locate real vs demo flags & track counts
          const demoMode = apiData.demoMode ?? apiData.isDemoMode;
            // tracksAnalyzed may appear nested or as direct counts
          const tracksAnalyzed = apiData.tracksAnalyzed || apiData.analyzedTrackCount || apiData?.profile?.tracksAnalyzed || 0;
          summary.phases.api.demoMode = demoMode;
          summary.phases.api.tracksAnalyzed = tracksAnalyzed;
          if (HEALTH_ASSERT_DEMO && tracksAnalyzed >= MIN_REAL_TRACKS && demoMode === true) {
            summary.errors.push(`Demo gating assertion FAILED: tracksAnalyzed=${tracksAnalyzed} >= ${MIN_REAL_TRACKS} but demoMode=true`);
          }
          if (HEALTH_ASSERT_DEMO && tracksAnalyzed < MIN_REAL_TRACKS && demoMode === false) {
            summary.warnings.push(`Potential false real-mode: tracksAnalyzed=${tracksAnalyzed} below threshold ${MIN_REAL_TRACKS}`);
          }
        } else {
          summary.warnings.push('API response JSON parse failed or empty for cached-dashboard-data');
        }
      } catch (e) {
        console.log('API smoke test failed:', e.message);
        summary.warnings.push('API smoke test failed: ' + e.message);
      }
    } else {
      console.log('DASHBOARD_BASE_URL not set - skipping API smoke tests');
    }

    // Optional persistence of summary history for trend analysis
    if (HEALTH_HISTORY) {
      try {
        const historyColl = db.collection('pipeline_health_history');
        const historyDoc = { ...summary, _id: new Date(summary.timestamp) };
        await historyColl.updateOne({ _id: historyDoc._id }, { $set: historyDoc }, { upsert: true });
      } catch (e) {
        summary.warnings.push('Failed to persist health history: ' + e.message);
      }
    }

  } catch (err) {
    console.error('Fatal health check error:', err.message);
    summary.errors.push(err.message);
  } finally {
    if (client) await client.close().catch(()=>{});
    section('SUMMARY JSON');
    summary.durationMs = Date.now() - start;
    console.log(JSON.stringify(summary, null, 2));
    if (summary.errors.length) process.exitCode = 1;
    // Guidance for scheduler (printed only in verbose run)
    if (process.env.SHOW_SCHEDULER_HINTS === '1') {
      console.log('\nScheduler Hint: Run every 30m via Heroku Scheduler -> "node heroku-workers/event-population/pipeline-health-check.js"');
      console.log('Set HEALTH_HISTORY=1 once daily (e.g., 02:00) for trend capture.');
    }
  }
}).catch(e => { console.error('Failed to load fetch:', e.message); process.exit(1); });
