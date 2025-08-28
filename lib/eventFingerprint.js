const crypto = require('crypto');

function norm(s = '') {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D'"`]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normVenue(v) {
  if (!v) return '';
  return `${norm(v.name || '')}:${norm(v.address || '')}:${norm(v.city || '')}`;
}

function tryIsoDate(d) {
  try {
    if (!d) return '';
    const iso = new Date(d).toISOString();
    return iso.slice(0, 10);
  } catch (e) {
    return '';
  }
}

function canonicalKey({ name, date, venue, location, sourceId } = {}) {
  // Build a stable, source-agnostic fingerprint where possible.
  const d = tryIsoDate(date);
  const lat = location && Array.isArray(location.coordinates) ? location.coordinates[1] : (location && location.lat) || 0;
  const lon = location && Array.isArray(location.coordinates) ? location.coordinates[0] : (location && location.lon) || 0;

  const parts = [norm(name || ''), d, normVenue(venue || {}), `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`].filter(Boolean);

  if (parts.length >= 2) {
    const small = parts.join('|');
    return 'ev:' + crypto.createHash('sha1').update(small).digest('hex').slice(0, 16);
  }

  // Not enough data to build canonical key — fall back to sourceId based key if available
  if (sourceId) return `src:${String(sourceId)}`;
  return null;
}

module.exports = { canonicalKey, norm, normVenue };
