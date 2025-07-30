/**
 * ENHANCED DEDUPLICATION v2 - Prioritizes newest event, then quality.
 * WITH PHASE 1 METADATA PRESERVATION
 */
function mergeAndDeduplicateEvents(events) {
  const eventMap = new Map();

  for (const event of events) {
    if (!event || !event.name || !event.date) continue;

    // Create a robust key for grouping duplicates
    const normalizedName = event.name.toLowerCase().trim().replace(/[^\w\s]/g, '');
    const dateOnly = new Date(event.date).toISOString().split('T')[0];
    const normalizedVenue = (event.venue?.name || '').toLowerCase().trim();
    const key = `${normalizedName}-${dateOnly}-${normalizedVenue}`;

    const existingEvent = eventMap.get(key);

    if (!existingEvent) {
      eventMap.set(key, event);
    } else {
      // A duplicate is found, we must decide which one to keep.
      const existingTimestamp = new Date(existingEvent.updatedAt || existingEvent.createdAt || 0);
      const currentTimestamp = new Date(event.updatedAt || event.createdAt || 0);

      let keepNewEvent = false;

      // Priority 1: Keep the newest event based on timestamp.
      if (currentTimestamp > existingTimestamp) {
        keepNewEvent = true;
      } else if (currentTimestamp.getTime() === existingTimestamp.getTime()) {
        // Priority 2: If timestamps are equal, fall back to quality score.
        const existingQuality = calculateCompletenessScore(existingEvent);
        const currentQuality = calculateCompletenessScore(event);
        if (currentQuality > existingQuality) {
          keepNewEvent = true;
        }
      }

      if (keepNewEvent) {
        // The new event is better. Merge metadata from the old one into it.
        const mergedEvent = {
          ...event, // Start with the new event
          soundCharacteristics: event.soundCharacteristics || existingEvent.soundCharacteristics,
          artistMetadata: event.artistMetadata || existingEvent.artistMetadata,
          enhancedGenres: event.enhancedGenres || existingEvent.enhancedGenres,
        };
        eventMap.set(key, mergedEvent);
      } else {
        // The existing event is better. Merge metadata from the new one into it.
        const mergedEvent = {
          ...existingEvent, // Start with the existing event
          soundCharacteristics: existingEvent.soundCharacteristics || event.soundCharacteristics,
          artistMetadata: existingEvent.artistMetadata || event.artistMetadata,
          enhancedGenres: existingEvent.enhancedGenres || event.enhancedGenres,
        };
        eventMap.set(key, mergedEvent);
      }
    }
  }

  const deduplicated = Array.from(eventMap.values());
  console.log(`📊 Deduplication v2 complete: ${events.length} → ${deduplicated.length} events (${events.length - deduplicated.length} duplicates removed, newest preserved)`);
  return deduplicated;
}
