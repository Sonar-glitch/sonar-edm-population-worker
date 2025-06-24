const { MongoClient } = require('mongodb');

async function clearEventsCache() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('MONGODB_URI environment variable not found');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(process.env.MONGODB_DB || 'test');
    
    // Delete all cache entries that start with 'events_'
    const result = await db.collection('apiCache').deleteMany({
      key: { $regex: '^events_' }
    });
    
    console.log(`✅ Successfully cleared ${result.deletedCount} events cache entries`);
    
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  }
}

clearEventsCache();
