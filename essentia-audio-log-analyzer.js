#!/usr/bin/env node
/**
 * ESSENTIA AUDIO LOG ANALYZER
 * Parses JSON structured logs emitted by build-essentia-audio-matrix.js (v2)
 * to surface failure causes, coverage, and audio source distribution.
 *
 * Usage:
 *   node build-essentia-audio-matrix.js > essentia-run.log 2>&1
 *   node essentia-audio-log-analyzer.js --file=essentia-run.log
 *
 * Supports streaming stdin as well:
 *   node build-essentia-audio-matrix.js | node essentia-audio-log-analyzer.js
 */

const fs = require('fs');
const readline = require('readline');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (const a of args) {
    const [k,v] = a.split('=');
    if (k.startsWith('--')) out[k.slice(2)] = v === undefined ? true : v;
  }
  return out;
}

async function analyze(stream) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const stats = {
    total: 0,
    success: 0,
    fail: 0,
    skipped: 0,
    failReasons: {},
    audioSources: { spotify:0, apple:0, soundcloud:0, youtube:0, beatport:0, bandcamp:0 },
    tracksAnalyzed: [],
    durations: [],
    firstTs: null,
    lastTs: null
  };

  for await (const line of rl) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (!obj.event && !obj.evt) continue; // not our structured event
    const evt = obj.event || obj.evt;
    stats.lastTs = obj.ts || new Date().toISOString();
    if (!stats.firstTs) stats.firstTs = stats.lastTs;

    switch (evt) {
      case 'artist_begin':
        stats.total++; break;
      case 'artist_success':
        stats.success++;
        if (obj.tracksAnalyzed !== undefined) stats.tracksAnalyzed.push(obj.tracksAnalyzed);
        if (obj.durationMs !== undefined) stats.durations.push(obj.durationMs);
        if (obj.audioSources) {
          for (const [k,v] of Object.entries(obj.audioSources)) {
            if (k in stats.audioSources) stats.audioSources[k] += v;
          }
        }
        break;
      case 'artist_fail':
      case 'artist_error':
        stats.fail++;
        const reason = obj.failSubtype || obj.reason || obj.error || 'unknown';
        stats.failReasons[reason] = (stats.failReasons[reason] || 0) + 1;
        break;
      case 'skip':
        stats.skipped++; break;
      case 'summary':
        // we can reconcile at end if needed
        break;
      default:
        break; // ignore others for aggregation
    }
  }

  const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
  const p = (arr, q) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a,b)=>a-b);
    const idx = Math.floor((q/100)* (sorted.length-1));
    return sorted[idx];
  };

  const coveragePercent = stats.total ? ((stats.success / stats.total) * 100).toFixed(2) : '0.00';
  const failBreakdown = Object.entries(stats.failReasons)
    .sort((a,b)=>b[1]-a[1])
    .map(([r,c])=>`${r}:${c}`)
    .join(', ');

  const result = {
    window: { firstEvent: stats.firstTs, lastEvent: stats.lastTs },
    artists: { attempted: stats.total, success: stats.success, fail: stats.fail, skipped: stats.skipped, coveragePercent },
    failures: stats.failReasons,
    topFailureReasons: failBreakdown,
    tracksAnalyzed: {
      mean: avg(stats.tracksAnalyzed).toFixed(2),
      p50: p(stats.tracksAnalyzed,50),
      p90: p(stats.tracksAnalyzed,90),
      distributionSample: stats.tracksAnalyzed.slice(0,25)
    },
    durationsMs: {
      mean: Math.round(avg(stats.durations)),
      p50: Math.round(p(stats.durations,50)),
      p90: Math.round(p(stats.durations,90))
    },
    audioSources: stats.audioSources
  };

  console.log('\n=== Essentia Audio Run Summary ===');
  console.table(result.artists);
  console.log('Failure Reasons:', result.topFailureReasons || 'none');
  console.log('Tracks per Artist (mean / p50 / p90):', result.tracksAnalyzed.mean, result.tracksAnalyzed.p50, result.tracksAnalyzed.p90);
  console.log('Durations ms (mean / p50 / p90):', result.durationsMs.mean, result.durationsMs.p50, result.durationsMs.p90);
  console.log('Audio Source Totals:', result.audioSources);
  console.log('\nJSON Output:\n', JSON.stringify(result, null, 2));
}

(async () => {
  const args = parseArgs();
  if (args.file) {
    const stream = fs.createReadStream(args.file, { encoding: 'utf8' });
    await analyze(stream);
  } else {
    await analyze(process.stdin);
  }
})();
