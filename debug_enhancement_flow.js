const mongoose = require('mongoose');
const { RecommendationEnhancer } = require('./lib/recommendationEnhancer');

async function debugEnhancementFlow() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const enhancer = new RecommendationEnhancer();
    enhancer.enabled = true;
    
    const event = await db.collection('events_unified').findOne({
      enhancementProcessed: { $ne: true }
    });
    
    console.log('=== DEBUGGING ENHANCEMENT FLOW ===');
    console.log('Event name:', event?.name);
    console.log('Event artistList:', event?.artistList);
    console.log('Event artists:', event?.artists?.map(a => a.name));
    console.log('Event genres:', event?.genres);
    
    console.log('\n=== TESTING needsEnhancement ===');
    const needs = enhancer.needsEnhancement(event);
    console.log('Needs enhancement:', needs);
    
    if (needs) {
      console.log('\n=== TESTING extractArtists ===');
      const artistResult = enhancer.extractArtists(event);
      console.log('Artist extraction result:', artistResult.artists);
      
      console.log('\n=== TESTING detectGenres ===');
      const genreResult = enhancer.detectGenres(artistResult);
      console.log('Genre detection result:', genreResult.primaryGenre, genreResult.isEdmEvent);
      
      console.log('\n=== TESTING calculateRecommendationScore ===');
      const scoreResult = enhancer.calculateRecommendationScore(genreResult);
      console.log('Score calculation result:', scoreResult.recommendationMetrics?.tasteScore);
      
      console.log('\n=== FULL ENHANCEMENT ===');
      const enhanced = await enhancer.enhanceEvent(event);
      console.log('Final enhancement processed:', enhanced.enhancementProcessed);
    } else {
      console.log('Event does not need enhancement - checking why...');
      console.log('Event.enhancementProcessed:', event.enhancementProcessed);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    process.exit(0);
  }
}

debugEnhancementFlow();
