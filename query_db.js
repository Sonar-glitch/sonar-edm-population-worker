const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.once('open', async () => {
  const db = mongoose.connection.db;
  const sample = await db.collection('events_unified').findOne({});
  console.log('Source:', sample?.source);
  console.log('Name:', sample?.name);
  const richie = await db.collection('events_unified').findOne({name: {$regex: /richie/i}});
  if(richie) console.log('Richie source:', richie.source);
  process.exit(0);
});
