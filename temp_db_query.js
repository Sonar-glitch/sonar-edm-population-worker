const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.once('open', async () => {
  const db = mongoose.connection.db;
  const sample = await db.collection('events_unified').findOne({});
  console.log('Sample event source field:', sample?.source);
  console.log('Sample event name:', sample?.name);
  console.log('Sample event id:', sample?.id);
  process.exit(0);
});