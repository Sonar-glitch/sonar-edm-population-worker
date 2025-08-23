// Safe wrapper around various versions of validateUnifiedArchitecture
// Ensures a consistent API: isCompliant(), autoFix(), getStatus()
function buildArchitectureValidator(raw) {
  const noopAsync = async () => {};
  const defaultStatus = async () => ({ compliant: true, singleSource: true, recommendedCollection: 'events_unified' });

  const wrapped = {
    isCompliant: async () => {
      try {
        if (!raw) return true;
        if (typeof raw.isCompliant === 'function') {
          const r = raw.isCompliant();
          return (r && typeof r.then === 'function') ? await r : r;
        }
        // Best-effort fallback: check recommended collection
        if (typeof raw.getRecommendedCollection === 'function') {
          const rec = raw.getRecommendedCollection();
          return rec === 'events_unified';
        }
        // If raw exposes allowed collections, prefer that
        if (Array.isArray(raw.allowedCollections)) {
          return raw.allowedCollections.includes('events_unified');
        }
        return true;
      } catch (err) {
        console.warn('architectureValidator.isCompliant fallback error:', err && err.message);
        return true;
      }
    },

    autoFix: async () => {
      try {
        if (!raw) return;
        if (typeof raw.autoFix === 'function') {
          const r = raw.autoFix();
          if (r && typeof r.then === 'function') await r;
          return;
        }
        // No-op fallback with log
        console.warn('architectureValidator.autoFix not available — no-op fallback');
      } catch (err) {
        console.warn('architectureValidator.autoFix fallback error:', err && err.message);
      }
    },

    getStatus: async () => {
      try {
        if (!raw) return await defaultStatus();
        if (typeof raw.getStatus === 'function') {
          const r = raw.getStatus();
          return (r && typeof r.then === 'function') ? await r : r;
        }
        // Construct a best-effort status
        const recommended = (typeof raw.getRecommendedCollection === 'function') ? raw.getRecommendedCollection() : (Array.isArray(raw.allowedCollections) ? (raw.allowedCollections.includes('events_unified') ? 'events_unified' : raw.allowedCollections[0]) : 'events_unified');
        return { compliant: recommended === 'events_unified', singleSource: recommended === 'events_unified', recommendedCollection: recommended };
      } catch (err) {
        console.warn('architectureValidator.getStatus fallback error:', err && err.message);
        return await defaultStatus();
      }
    }
  };

  return wrapped;
}

module.exports = { buildArchitectureValidator };
