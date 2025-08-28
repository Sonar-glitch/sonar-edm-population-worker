require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set in environment');
    process.exit(1);
  }

  // ensure correct cwd so model paths resolve
  process.chdir(path.resolve(__dirname, '..'));

  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const UnifiedEvent = require('../models/UnifiedEvent');

    const countNull = await UnifiedEvent.countDocuments({ eventKey: null });
    const countMissing = await UnifiedEvent.countDocuments({ eventKey: { $exists: false } });
    const sampleNull = await UnifiedEvent.find({ eventKey: null }).limit(5).lean();
    const sampleMissing = await UnifiedEvent.find({ eventKey: { $exists: false } }).limit(5).lean();

    console.log('Existing events_unified with eventKey === null:', countNull);
    console.log('Existing events_unified missing eventKey field:', countMissing);
    console.log('\nSample documents with eventKey === null (up to 5):');
    console.dir(sampleNull, { depth: 2, colors: false });

    console.log('\nSample documents missing eventKey (up to 5):');
    console.dir(sampleMissing, { depth: 2, colors: false });

    await mongoose.disconnect();
  } catch (err) {
    console.error('Diagnostic script failed:', err && err.message);
    try { await mongoose.disconnect(); } catch(e){}
    process.exit(1);
  }
}

run();
