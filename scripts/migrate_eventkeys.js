require('dotenv').config();
const mongoose = require('mongoose');
const UnifiedEvent = require('../models/UnifiedEvent');
const { canonicalKey } = require('../lib/eventFingerprint');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  console.log('Connected for migrate_eventkeys dry-run');

  const query = { $or: [{ eventKey: { $exists: false } }, { eventKey: null }, { eventKey: '' }] };
  const cursor = UnifiedEvent.find(query).cursor();
  let count = 0;
  const plan = {};
  const ops = [];
  const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';
  const BATCH = parseInt(process.env.PROCESS_BATCH_SIZE || '50', 10) || 50;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    count++;
    const key = canonicalKey({ name: doc.name, date: doc.date, venue: doc.venue, location: doc.location, sourceId: doc.sourceId });
    if (!plan[key]) plan[key] = { key, sampleIds: [], proposed: 0 };
    plan[key].proposed++;
    if (plan[key].sampleIds.length < 3) plan[key].sampleIds.push(String(doc._id));

    if (APPLY) {
      // Prepare safe update: set eventKey and add to sources array for provenance
      const filter = { _id: doc._id };
      const update = {
        $set: { eventKey: key || `src:${doc.sourceId}` },
        $setOnInsert: { createdAt: doc.createdAt || new Date() },
        $push: { sources: { source: doc.source || 'unknown', sourceId: doc.sourceId || null, recordedAt: doc.updatedAt || doc.createdAt || new Date() } }
      };
      ops.push({ updateOne: { filter, update, upsert: false } });
    }

    // execute in small batches when applying
    if (APPLY && ops.length >= BATCH) {
      const result = await UnifiedEvent.bulkWrite(ops, { ordered: false });
      console.log(`Applied batch write: matched=${result.matchedCount || 0} modified=${result.modifiedCount || 0}`);
      ops.length = 0;
    }
  }

  console.log(`Scanned ${count} legacy docs missing eventKey. Proposed grouping keys: ${Object.keys(plan).length}`);
  const sample = Object.values(plan).slice(0, 20);
  console.log('Sample proposed groups (up to 20):', sample);

  if (APPLY && ops.length > 0) {
    const result = await UnifiedEvent.bulkWrite(ops, { ordered: false });
    console.log(`Applied final batch write: matched=${result.matchedCount || 0} modified=${result.modifiedCount || 0}`);
  }

  await mongoose.disconnect();
  if (APPLY) console.log('Apply complete.');
  else console.log('Dry-run complete. To apply changes, run this script with APPLY=1 (cautious apply).');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration script failed:', err && err.message);
  process.exit(1);
});
