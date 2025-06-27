
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.once('open', async () => {
  const db = mongoose.connection.db;
  const result = await db.collection('apiCache').deleteMany({ 
    key: { $regex: '^events_' } 
  });
  console.log(`Cleared ${result.deletedCount} cache entries`);
  process.exit(0);
});

