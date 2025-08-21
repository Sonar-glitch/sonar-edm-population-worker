#!/usr/bin/env node
/**
 * ESSENTIA-BASED AUDIO PROFILE MATRIX BUILDER (v2)
 * NEW (Aug 19 2025):
 * - Centralizes track sourcing via Essentia Service /api/analyze-artist endpoint (multi-source: Spotify/Apple/Alt)
 * - Structured JSON logging for reliable parsing (LOG_LEVEL=debug for verbose)
 * - Concurrency control (ESSENTIA_WORKER_CONCURRENCY, default 2)
 * - Failure reason aggregation + coverage summary
 * - Idempotent skip if profile already present unless FORCE_REBUILD_AUDIO=1
 * - CorrelationId per artist for cross-service tracing
 */

const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

// Configuration (env overrides highly encouraged)
const ESSENTIA_SERVICE_URL = process.env.ESSENTIA_SERVICE_URL || 'https://tiko-essentia-audio-service-2eff1b2af167.herokuapp.com';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://furqanzemail:XJfBasTxNcle2CEs@sonaredm.g4cdx.mongodb.net/test?retryWrites=true&w=majority&appName=SonarEDM';
const DB_NAME = process.env.MONGODB_DB || 'test';
const MAX_TRACKS = parseInt(process.env.ESSENTIA_MAX_TRACKS || '20', 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.ESSENTIA_WORKER_CONCURRENCY || '2', 10));
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug|info|warn|error
const FORCE_REBUILD = process.env.FORCE_REBUILD_AUDIO === '1';
const BATCH_LIMIT = parseInt(process.env.ESSENTIA_BATCH_LIMIT || '0', 10); // 0 = all

function log(event) {
  const level = event.level || 'info';
  const levels = { debug: 10, info: 20, warn: 30, error: 40 };
  if (levels[level] < levels[LOG_LEVEL]) return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));
}

async function buildEssentiaAudioProfileMatrix() {
  const start = Date.now();
  log({ event: 'start', phase: 'essentia_matrix', msg: 'Starting Essentia audio profile build', service: ESSENTIA_SERVICE_URL });
  const fetch = (await import('node-fetch')).default;

  // Connectivity check
  try {
    const health = await fetch(`${ESSENTIA_SERVICE_URL}/health`);
    if (!health.ok) throw new Error(`status=${health.status}`);
    const healthJson = await health.json();
    log({ event: 'health', status: 'ok', uptime: healthJson.uptime, mongodb: healthJson.mongodb });
  } catch (e) {
    log({ event: 'health', status: 'fail', error: e.message, level: 'error' });
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const artistGenres = db.collection('artistGenres');

  // Query target artists: missing profile, built flag not true, or empty trackMatrix
  const baseQuery = FORCE_REBUILD ? {} : {
    $or: [
      { essentiaAudioProfile: { $exists: false } },
      { essentiaProfileBuilt: { $ne: true } },
      { 'essentiaAudioProfile.trackMatrix.0': { $exists: false } }
    ]
  };
  const cursor = artistGenres.find(baseQuery, { projection: { originalName: 1, spotifyId: 1, normalizedGenres: 1 } });
  const targets = await cursor.toArray();
  const sliced = BATCH_LIMIT > 0 ? targets.slice(0, BATCH_LIMIT) : targets;
  log({ event: 'candidate_list', totalCandidates: targets.length, selected: sliced.length, forceRebuild: FORCE_REBUILD });

  let success = 0, fail = 0, skipped = 0;
  const failReasons = {};

  async function processArtist(artist) {
    const correlationId = crypto.randomUUID();
    const aStart = Date.now();
    try {
      if (!FORCE_REBUILD && artist.essentiaAudioProfile) {
        skipped++;
        return log({ event: 'skip', correlationId, artistId: artist._id, name: artist.originalName, reason: 'already_has_profile' });
      }
      log({ event: 'artist_begin', correlationId, artistId: artist._id, name: artist.originalName });

      const body = {
        artistName: artist.originalName,
        spotifyId: artist.spotifyId,
        maxTracks: MAX_TRACKS,
        existingGenres: artist.normalizedGenres || [],
        includeRecentReleases: true
      };
      const resp = await fetch(`${ESSENTIA_SERVICE_URL}/api/analyze-artist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-correlation-id': correlationId },
        body: JSON.stringify(body),
        timeout: 90000
      });
      if (!resp.ok) throw new Error(`analyze-artist HTTP ${resp.status}`);
      const data = await resp.json();
      if (!data.success) {
        fail++;
        const reason = data.failSubtype || data.error || 'unknown';
        failReasons[reason] = (failReasons[reason] || 0) + 1;
        const spotifyTokenStatus = data.metadata?.spotifyTokenStatus || data.spotifyTokenStatus || 'unknown';
        return log({ event: 'artist_fail', correlationId, artistId: artist._id, name: artist.originalName, reason, meta: { tracksAttempted: data.tracksAttempted, failureReasons: data.failureReasons, spotifyTokenStatus }, level: 'warn'});
      }

  const isPartial = !!data.partial || (Array.isArray(data.trackMatrix) && data.trackMatrix.length === 0);
  const spotifyTokenStatus = data.metadata?.spotifyTokenStatus || data.spotifyTokenStatus || 'unknown';

      // Extract lightweight vectors (only if any tracks)
      const vectors = (data.trackMatrix || [])
        .filter(t => Array.isArray(t.essentiaFeatures?.vector))
        .map(t => ({ trackId: t.trackId, v: t.essentiaFeatures.vector, isRecent: !!t.isRecentRelease }));

      const profileDoc = {
        trackMatrix: data.trackMatrix || [],
        vectors,
        averageFeatures: data.averageFeatures || {},
        spectralFeatures: data.spectralFeatures || {},
        genreMapping: data.genreMapping || {},
        metadata: data.metadata || {},
        recentEvolution: data.recentEvolution || {},
        builtAt: new Date(),
        essentiaVersion: data.metadata?.analysisVersion || '1.0',
        source: 'essentia_service_v2',
        partial: isPartial
      };

      // Flag low-confidence when partial (no audio vectors)
      if (isPartial) {
        profileDoc.metadata = {
          ...(profileDoc.metadata || {}),
          lowConfidenceAudio: true,
          partial: true
        };
      }

      try {
        await artistGenres.updateOne(
          { _id: artist._id },
          { $set: { essentiaAudioProfile: profileDoc, essentiaProfileBuilt: true, essentiaProfileDate: new Date(), essentiaProfilePartial: isPartial } }
        );
      } catch (uErr) {
        failReasons['update_failure'] = (failReasons['update_failure'] || 0) + 1;
        log({ event: 'artist_update_error', correlationId, artistId: artist._id, name: artist.originalName, error: uErr.message, level: 'error' });
        fail++;
        return;
      }

      if (isPartial) {
        failReasons['partial_no_audio'] = (failReasons['partial_no_audio'] || 0) + 1; // counted separately for visibility
        success++; // still counts toward coverage (has profile) but tracked
        return log({ event: 'artist_partial', correlationId, artistId: artist._id, name: artist.originalName, tracksAnalyzed: 0, vectors: 0, reason: 'no_audio_analysis', spotifyTokenStatus, durationMs: Date.now() - aStart, level: 'warn' });
      }

      success++;
      log({ event: 'artist_success', correlationId, artistId: artist._id, name: artist.originalName, tracksAnalyzed: profileDoc.trackMatrix.length, vectors: vectors.length, audioSources: profileDoc.metadata?.audioSources, spotifyTokenStatus, durationMs: Date.now() - aStart });
    } catch (e) {
      fail++;
      const reason = e.message.split(' ')[0];
      failReasons[reason] = (failReasons[reason] || 0) + 1;
      log({ event: 'artist_error', correlationId, artistId: artist._id, name: artist.originalName, error: e.message, durationMs: Date.now() - aStart, level: 'error' });
    }
  }

  // Simple concurrency pool
  const queue = [...sliced];
  const workers = Array.from({ length: CONCURRENCY }).map(async () => {
    while (queue.length) {
      const artist = queue.shift();
      await processArtist(artist);
      // Gentle pacing to avoid overwhelming service
      await new Promise(r => setTimeout(r, 500));
    }
  });
  await Promise.all(workers);

  // Coverage stats
  const totalArtists = await artistGenres.countDocuments();
  const covered = await artistGenres.countDocuments({ essentiaAudioProfile: { $exists: true } });

  log({ event: 'summary', success, fail, skipped, totalProcessed: sliced.length, coveragePercent: ((covered/totalArtists)*100).toFixed(2), durationMs: Date.now() - start, failReasons });

  await client.close();
}

// Execute if direct run
if (require.main === module) {
  buildEssentiaAudioProfileMatrix().catch(err => {
    log({ event: 'fatal', error: err.message, stack: err.stack, level: 'error' });
    process.exit(1);
  });
}

module.exports = { buildEssentiaAudioProfileMatrix };
