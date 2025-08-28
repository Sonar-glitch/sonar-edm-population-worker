// Lightweight test harness for fetchTicketmaster guard logic
// Run with: node fetchTicketmaster_guard.test.js

async function mockFetchTicketmasterSave(transformedEvents) {
  const bulkOps = [];
  let skipped = 0;

  for (const event of transformedEvents) {
    const hasEventKey = event && (event.eventKey || (event.eventKey === 0));
    const hasSourceId = event && (event.sourceId || (event.sourceId === 0));

    if (!hasEventKey && !hasSourceId) {
      skipped++;
      console.warn(`⚠️ Skipping ticketmaster upsert: missing eventKey and sourceId for event (name:${event && event.name} id:${event && event.sourceId})`);
      continue;
    }

    const filter = hasEventKey ? { eventKey: event.eventKey } : { source: event.source, sourceId: event.sourceId };

    bulkOps.push({
      updateOne: {
        filter,
        update: { $set: { ...event, lastUpdated: new Date() } },
        upsert: true
      }
    });
  }

  // Mock bulkWrite behaviour
  const mockBulkWrite = async (ops) => ({ insertedCount: 0, modifiedCount: ops.length - 1, upsertedCount: ops.length });

  if (bulkOps.length === 0) {
    console.log(`ℹ️ No valid ticketmaster events to upsert (skipped ${skipped} invalid events)`);
    return { saved: 0, updated: 0, errors: skipped };
  }

  const result = await mockBulkWrite(bulkOps);
  console.log(`✅ Mock bulkWrite: upserted ${result.upsertedCount}, modified ${result.modifiedCount} (skipped ${skipped})`);

  return { saved: result.upsertedCount, updated: result.modifiedCount, errors: skipped };
}

(async function runTest() {
  console.log('--- fetchTicketmaster guard logic unit test ---');

  const transformedEvents = [
    { name: 'TM Event with eventKey', eventKey: 'tx-1', sourceId: 'tm-1' },
    { name: 'TM Event with sourceId only', source: 'ticketmaster', sourceId: 'tm-2' },
    { name: 'TM Bad event (missing keys)' }
  ];

  const res = await mockFetchTicketmasterSave(transformedEvents);
  console.log('\nTest result:', res);
  console.log('Expected: saved >=1, errors includes 1 skipped event');
})();
