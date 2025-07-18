const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.once('open', async () => {
  const db = mongoose.connection.db;
  
  // Check for enhanced events
  const enhanced = await db.collection('events_unified').findOne({ 
    enhancementProcessed: true 
  });
  
  if (enhanced) {
    console.log('✅ Enhanced Event Found:');
    console.log('Name:', enhanced.name);
    console.log('Artists:', enhanced.artists);
    console.log('Primary Genre:', enhanced.primaryGenre);
    console.log('Is EDM:', enhanced.isEdmEvent);
    console.log('Taste Score:', enhanced.recommendationMetrics?.tasteScore);
  } else {
    console.log('⏳ No enhanced events found yet - worker may still be processing');
  }
  
  process.exit(0);
});
