const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const { canonicalKey } = require('../lib/eventFingerprint');

const MONGODB_URI = process.env.MONGODB_URI;
const BATCH = parseInt(process.env.PROCESS_BATCH_SIZE || '50', 10) || 50;

if (!MONGODB_URI) {
  console.error('MONGODB_URI missing');
  process.exit(1);
}

(async function main(){
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  const col = db.collection('events_unified');

  const query = { $or:[{eventKey:{$exists:false}},{eventKey:null},{eventKey:''}] };
  const docs = await col.find(query).project({_id:1, name:1, date:1, venue:1, location:1, sourceId:1, source:1, updatedAt:1, createdAt:1}).toArray();
  console.log('Found', docs.length, 'docs missing eventKey');

  const backupPath = path.resolve(process.cwd(), `./heroku-workers/event-population/scripts/backup_missing_eventkeys_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(docs, null, 2));
  console.log('Wrote backup of affected docs to', backupPath);

  let totalMatched=0, totalModified=0;
  const ops = [];

  for (let i=0;i<docs.length;i++){
    const d = docs[i];
    const key = canonicalKey({ name: d.name, date: d.date, venue: d.venue, location: d.location, sourceId: d.sourceId }) || (d.sourceId ? `src:${d.sourceId}` : null);
    if (!key) {
      console.warn('Skipping doc without fallback key:', d._id);
      continue;
    }

    const update = { $set: { eventKey: key }, $addToSet: { sources: { source: d.source || 'unknown', sourceId: d.sourceId || null, recordedAt: d.updatedAt || d.createdAt || new Date() } } };
    ops.push({ updateOne: { filter: { _id: d._id }, update, upsert: false } });

    if (ops.length >= BATCH) {
      const res = await col.bulkWrite(ops, { ordered: false });
      totalMatched += res.matchedCount || 0;
      totalModified += res.modifiedCount || 0;
      console.log(`Applied batch: matched=${res.matchedCount||0} modified=${res.modifiedCount||0}`);
      ops.length = 0;
    }
  }

  if (ops.length > 0) {
    const res = await col.bulkWrite(ops, { ordered: false });
    totalMatched += res.matchedCount || 0;
    totalModified += res.modifiedCount || 0;
    console.log(`Applied final batch: matched=${res.matchedCount||0} modified=${res.modifiedCount||0}`);
  }

  console.log('Total matched=', totalMatched, 'total modified=', totalModified);

  // Print a sample of updated docs
  const sample = await col.find({ eventKey: { $exists: true, $ne: '' } }).limit(5).toArray();
  console.log('Sample updated docs:', sample.map(s=>({ _id: s._id, eventKey: s.eventKey, sources: s.sources }))); 

  await client.close();
})();
