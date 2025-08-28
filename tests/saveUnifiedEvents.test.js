// Lightweight test harness for saveUnifiedEvents logic (no MongoDB required)
// Run with: node saveUnifiedEvents.test.js

async function mockSaveUnifiedEvents(events) {
  // Simulate the same guard and upsert-op creation logic from the worker
  const validOps = [];
  let skipped = 0;

  for (const event of events) {
    const hasEventKey = event && (event.eventKey || (event.eventKey === 0));
    const hasSourceId = event && (event.sourceId || (event.sourceId === 0));

    if (!hasEventKey && !hasSourceId) {
      skipped++;
      console.warn(`⚠️ Skipping upsert: missing eventKey and sourceId for event (name:${event && event.name} id:${event && event.id})`);
      continue;
    }

    const filter = hasEventKey ? { eventKey: event.eventKey } : { sourceId: event.sourceId };

    validOps.push({
      updateOne: {
        filter,
        update: { $set: event },
        upsert: true
      }
    });
  }

  // Mock UnifiedEvent.bulkWrite -> simulate result
  const mockBulkWrite = async (ops, opts) => {
    console.log(`
    [mockBulkWrite] Received ${ops.length} operations, ordered=${opts && opts.ordered}`);
    // pretend one upsert and one modified
    return {
      upsertedCount: ops.filter(o => o.updateOne.filter.eventKey === 'ek-1' || o.updateOne.filter.sourceId === 's-2').length,
      modifiedCount: Math.max(0, ops.length - 1),
      writeErrors: []
    };
  };

  // Mock cleanupOldEvents
  const mockCleanup = async () => 0;

  if (validOps.length === 0) {
    console.log(`ℹ️ No valid events to upsert (skipped ${skipped} invalid events)`);
    return { saved: 0, updated: 0, errors: skipped, cleaned: 0 };
  }

  const result = await mockBulkWrite(validOps, { ordered: false });
  const cleanupCount = await mockCleanup();

  console.log(`✅ Bulk operation complete: ${result.upsertedCount} new, ${result.modifiedCount} updated (skipped ${skipped} invalid events)`);

  return {
    saved: result.upsertedCount,
    updated: result.modifiedCount,
    errors: (result.writeErrors ? result.writeErrors.length : 0) + skipped,
    cleaned: cleanupCount
  };
}

(async function runTest() {
  console.log('--- saveUnifiedEvents guard logic unit test ---');

  const events = [
    { name: 'Event with eventKey', eventKey: 'ek-1', sourceId: 's-1', id: '1' },
    { name: 'Event with sourceId only', sourceId: 's-2', id: '2' },
    { name: 'Bad event (missing keys)', nameExtra: 'no keys', id: '3' }
  ];

  const res = await mockSaveUnifiedEvents(events);

  console.log('\nTest result:', res);
  console.log('Expected: saved >=1, updated >=0, errors includes 1 skipped event');
})();
