const mongoose = require('mongoose');
const { RecommendationEnhancer } = require('./lib/recommendationEnhancer');

async function debugNeedsEnhancement() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const enhancer = new RecommendationEnhancer();
  
  const event = await db.collection('events_unified').findOne({
    enhancementProcessed: { $ne: true }
  });
  
  console.log('=== DEBUGGING needsEnhancement LOGIC ===');
  console.log('event.artists:', event.artists);
  console.log('event.artists type:', typeof event.artists);
  console.log('event.artists.length:', event.artists?.length);
  
  const hasNoArtists = !event.artists || event.artists.length === 0;
  const hasNoGenres = !event.genres || event.genres.length === 0;
  const hasNoScore = !event.recommendationMetrics;
  const notProcessed = !event.enhancementProcessed;
  
  console.log('hasNoArtists:', hasNoArtists);
  console.log('hasNoGenres:', hasNoGenres);
  console.log('hasNoScore:', hasNoScore);
  console.log('notProcessed:', notProcessed);
  console.log('Final result:', (hasNoArtists || hasNoGenres || hasNoScore) && notProcessed);
  
  process.exit(0);
}

debugNeedsEnhancement();
