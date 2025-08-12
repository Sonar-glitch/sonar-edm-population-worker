const { MongoClient } = require('mongodb');
MongoClient.connect(process.env.MONGODB_URI).then(client => {
  const db = client.db();
  return db.collection('events_unified').findOne(
    { 
      name: { $regex: /pop|dimension/i },
      soundCharacteristics: { $exists: true }
    },
    { projection: { name: 1, soundCharacteristics: 1, genres: 1, lastUpdated: 1 } }
  );
}).then(result => {
  console.log('Enhanced event:', JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(console.error);
