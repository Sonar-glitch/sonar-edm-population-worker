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
    errors: []
  };

  function section(title) {
    console.log('\n' + title);
    console.log('='.repeat(title.length));
  }

  // Use worker-standard env names
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  const DB_NAME = process.env.MONGO_DB || process.env.MONGODB_DB || 'test';
  const ESSENTIA_SERVICE_URL = process.env.ESSENTIA_SERVICE_URL || 'https://tiko-essentia-audio-service-2eff1b2af167.herokuapp.com';

  let client;
  try {
    section('1. Database Foundations');
    client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    const eventsUnifiedCount = await db.collection('events_unified').countDocuments();
    const eventsCount = await db.collection('events').countDocuments().catch(() => 0);

    console.log(`events_unified: ${eventsUnifiedCount}`);
    console.log(`events (legacy/supplementary): ${eventsCount}`);

    summary.phases.database = {
      events_unified: eventsUnifiedCount,
      events: eventsCount,
      status: eventsUnifiedCount > 8000 ? 'ok' : 'low'
    };

    const sample = await db.collection('events_unified').findOne({}, { projection: { name:1, date:1, sourceId:1, artistList:1 } });
    if (!sample?.name || !sample?.date || !sample?.sourceId) {
      summary.warnings.push('Sample event missing critical fields');
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
    const profileCount = await db.collection('user_sound_profiles').countDocuments().catch(()=>0);
    const recentProfiles = await db.collection('user_sound_profiles').countDocuments({ createdAt: { $gte: new Date(Date.now()-86400000) } }).catch(()=>0);
    console.log(`user_sound_profiles total: ${profileCount}`);
    console.log(`profiles last 24h: ${recentProfiles}`);

    summary.phases.userProfiles = {
      total: profileCount,
      last24h: recentProfiles,
      status: profileCount > 0 ? 'ok' : 'empty'
    };

    const idx = await db.collection('user_sound_profiles').listIndexes().toArray();
    const hasTTL = idx.some(i => i.key?.expiresAt && i.expireAfterSeconds);
    if (!hasTTL) summary.warnings.push('Missing TTL index on user_sound_profiles.expiresAt');
    summary.phases.userProfiles.ttlIndex = hasTTL;

    section('6. API Smoke Tests (optional)');
    const apiBase = process.env.DASHBOARD_BASE_URL; // e.g., https://sonar-edm-staging.herokuapp.com
    if (apiBase) {
      try {
        const resp = await fetch(`${apiBase}/api/user/cached-dashboard-data`, { headers: { 'Accept':'application/json' } });
        console.log(`/cached-dashboard-data: ${resp.status}`);
        summary.phases.api = { cachedDashboardData: resp.status };
      } catch (e) {
        console.log('API smoke test failed:', e.message);
        summary.warnings.push('API smoke test failed: ' + e.message);
      }
    } else {
      console.log('DASHBOARD_BASE_URL not set - skipping API smoke tests');
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
  }
}).catch(e => { console.error('Failed to load fetch:', e.message); process.exit(1); });
