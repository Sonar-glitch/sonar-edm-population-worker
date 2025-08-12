const mongoose = require('mongoose');
const RecommendationEnhancer = require('./lib/recommendationEnhancer');

async function enhanceExistingEvents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔍 Connected to database...');
    
    const db = mongoose.connection.db;
    const enhancer = new RecommendationEnhancer();
    enhancer.enabled = true; // Force enable
    
    // Get a few events that need enhancement
    const events = await db.collection('events_unified').find({
      enhancementProcessed: { $ne: true }
    }).limit(5).toArray();
    
    console.log(`📊 Found ${events.length} events to enhance`);
    
    let successCount = 0;
    for (const event of events) {
      try {
        const enhanced = await enhancer.enhanceEvent(event);
        if (enhanced.enhancementProcessed) {
          // Update the event in database
          await db.collection('events_unified').updateOne(
            { _id: event._id },
            { $set: enhanced }
          );
          successCount++;
          console.log(`✅ Enhanced: ${event.name} -> ${enhanced.primaryGenre} (${enhanced.recommendationMetrics?.tasteScore}%)`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to enhance ${event.name}:`, error.message);
      }
    }
    
    console.log(`\n🎯 Enhancement complete: ${successCount}/${events.length} events enhanced`);
    
  } catch (error) {
    console.error('❌ Enhancement failed:', error.message);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  enhanceExistingEvents();
}
