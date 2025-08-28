require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set in environment');
    process.exit(1);
  }

  process.chdir(path.resolve(__dirname, '..'));

  try {
    await mongoose.connect(MONGODB_URI);
    const UnifiedEvent = require('../models/UnifiedEvent');

    const coll = UnifiedEvent.collection;
    const indexes = await coll.indexes();
    console.log('Indexes on events_unified:');
    console.dir(indexes, { depth: 4 });

    const docsNull = await coll.find({ eventKey: null }).toArray();
    const docsMissing = await coll.find({ eventKey: { $exists: false } }).toArray();
    console.log('\nDocuments with eventKey === null:');
    console.dir(docsNull, { depth: 2 });
    console.log('\nDocuments missing eventKey:');
    console.dir(docsMissing, { depth: 2 });

    await mongoose.disconnect();
  } catch (err) {
    console.error('inspect failed:', err && err.message);
    try { await mongoose.disconnect(); } catch(e){}
    process.exit(1);
  }
}
run();
