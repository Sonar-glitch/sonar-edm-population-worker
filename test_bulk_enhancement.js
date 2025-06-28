const mongoose = require('mongoose');
const { RecommendationEnhancer } = require('./lib/recommendationEnhancer');

async function testBulkEnhancement() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const enhancer = new RecommendationEnhancer();
    enhancer.enabled = true;
    
    // Get 5 events that need enhancement
    const events = await db.collection('events_unified').find({
      enhancementProcessed: { \$ne: true },
      recommendationMetrics: { \$exists: true }
    }).limit(5).toArray();
    
    console.log(\`Found \${events.length} events to enhance\`);
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(\`\\n--- Event \${i+1}: \${event.name} ---\`);
      
      const enhanced = await enhancer.enhanceEvent(event);
      
      console.log(\`Artists: [\${enhanced.artists?.join(', ') || 'none'}]\`);
      console.log(\`Primary genre: \${enhanced.primaryGenre}\`);
      console.log(\`Taste score: \${enhanced.recommendationMetrics?.tasteScore}\`);
      console.log(\`Enhanced: \${enhanced.enhancementProcessed}\`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testBulkEnhancement();
