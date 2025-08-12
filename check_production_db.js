// Check production database status
const { MongoClient } = require('mongodb');

async function checkProductionDB() {
  try {
    console.log('🔍 CHECKING PRODUCTION DATABASE...\n');
    
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('tiko_development');
    
    // 1. Check collections
    console.log('=== COLLECTIONS ===');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log('Available collections:', collectionNames.join(', '));
    
    // 2. Check events_unified
    console.log('\n=== EVENTS_UNIFIED ===');
    const eventCount = await db.collection('events_unified').countDocuments({});
    console.log('Total events:', eventCount);
    
    if (eventCount > 0) {
      // Sample events
      console.log('\nSample events:');
      const sampleEvents = await db.collection('events_unified').find({}).limit(5).toArray();
      sampleEvents.forEach((e, i) => {
        console.log(`${i+1}. "${e.name}"`);
        console.log(`   Score: ${e.personalizedScore || 'none'}`);
        console.log(`   Music Type: ${e.musicType || 'none'}`);
        console.log(`   Venue: ${typeof e.venue === 'object' ? e.venue.name : e.venue}`);
        console.log(`   URL: ${e.url || e.ticketUrl || 'none'}`);
        console.log(`   Fields: ${Object.keys(e).length}`);
        console.log('');
      });
      
      // Check for enhanced fields
      console.log('=== ENHANCED DATA STATUS ===');
      const withScores = await db.collection('events_unified').countDocuments({ 
        personalizedScore: { $exists: true, $ne: null } 
      });
      const withMusicType = await db.collection('events_unified').countDocuments({ 
        musicType: { $exists: true } 
      });
      const withAudioFeatures = await db.collection('events_unified').countDocuments({ 
        audioFeatures: { $exists: true } 
      });
      
      console.log(`Events with personalizedScore: ${withScores}/${eventCount}`);
      console.log(`Events with musicType: ${withMusicType}/${eventCount}`);
      console.log(`Events with audioFeatures: ${withAudioFeatures}/${eventCount}`);
      
      // Check for target events
      console.log('\n=== TARGET EVENTS SEARCH ===');
      const hernanEvents = await db.collection('events_unified').find({
        name: { $regex: 'hernan|cattaneo', $options: 'i' }
      }).toArray();
      console.log(`Hernan Cattaneo events: ${hernanEvents.length}`);
      
      const kreamEvents = await db.collection('events_unified').find({
        name: { $regex: 'kream', $options: 'i' }
      }).toArray();
      console.log(`Kream events: ${kreamEvents.length}`);
      
      const casaLomaEvents = await db.collection('events_unified').find({
        name: { $regex: 'casa loma', $options: 'i' }
      }).toArray();
      console.log(`Casa Loma events: ${casaLomaEvents.length}`);
      
      if (casaLomaEvents.length > 0) {
        console.log('\nCasa Loma events found:');
        casaLomaEvents.forEach((e, i) => {
          console.log(`${i+1}. "${e.name}" - Score: ${e.personalizedScore || 'none'}`);
        });
      }
      
    } else {
      console.log('❌ NO EVENTS FOUND IN DATABASE!');
    }
    
    await client.close();
    
  } catch (err) {
    console.error('❌ Database check failed:', err.message);
  }
}

checkProductionDB();
