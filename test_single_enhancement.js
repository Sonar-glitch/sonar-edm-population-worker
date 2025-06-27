const mongoose = require('mongoose');
const { RecommendationEnhancer } = require('./lib/recommendationEnhancer');

async function testSingleEnhancement() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const enhancer = new RecommendationEnhancer();
    enhancer.enabled = true;
    
    const event = await db.collection('events_unified').findOne({
      enhancementProcessed: { $ne: true }
    });
    
    console.log('Sample event name:', event?.name);
    console.log('Event has _embedded:', !!event?._embedded);
    console.log('Enhancer enabled:', enhancer.enabled);
    
    if (event) {
      const enhanced = await enhancer.enhanceEvent(event);
      console.log('Enhancement processed:', enhanced.enhancementProcessed);
      console.log('Primary genre:', enhanced.primaryGenre);
      console.log('Taste score:', enhanced.recommendationMetrics?.tasteScore);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testSingleEnhancement();
