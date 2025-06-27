const mongoose = require('mongoose');

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔍 Checking database for enhanced events...\n');
    
    const db = mongoose.connection.db;
    
    // Check for enhanced events
    const enhanced = await db.collection('events_unified').findOne({ 
      enhancementProcessed: true 
    });
    
    if (enhanced) {
      console.log('✅ Enhanced Event Found:');
      console.log('Name:', enhanced.name);
      console.log('Artists:', enhanced.artists || 'none');
      console.log('Primary Genre:', enhanced.primaryGenre || 'unknown');
      console.log('Is EDM:', enhanced.isEdmEvent || false);
      console.log('Taste Score:', enhanced.recommendationMetrics?.tasteScore || 'none');
      console.log('Enhancement Method:', enhanced.genreDetection?.method || 'none');
    } else {
      console.log('⏳ No enhanced events found yet');
      console.log('This is normal - worker may still be processing or enhancement may not have run yet');
    }
    
    // Check total events
    const total = await db.collection('events_unified').countDocuments();
    console.log(`\n📊 Total events in database: ${total}`);
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  checkDatabase();
}

module.exports = { checkDatabase };