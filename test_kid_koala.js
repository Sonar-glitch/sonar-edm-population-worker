const { RecommendationEnhancer } = require('./lib/recommendationEnhancer');

async function testKidKoala() {
  const enhancer = new RecommendationEnhancer();
  enhancer.enabled = true;
  
  // Test Kid Koala event
  const kidKoalaEvent = {
    name: 'Kid Koala - The Storyville Mosquito',
    artistList: ['Kid Koala'],
    artists: [{ name: 'Kid Koala', genres: ['Electronic'] }], // Wrong genre from Ticketmaster
    genres: ['electronic'], // Wrong genre
    venue: { name: 'The Phoenix Concert Theatre' }
  };
  
  console.log('🧪 Testing Kid Koala Enhancement...');
  const result = await enhancer.enhanceEvent(kidKoalaEvent);
  
  console.log('Event:', result.name);
  console.log('Artists extracted:', result.artists);
  console.log('Primary genre detected:', result.primaryGenre);
  console.log('Is EDM event:', result.isEdmEvent);
  console.log('Taste score:', result.recommendationMetrics?.tasteScore);
  console.log('Enhancement processed:', result.enhancementProcessed);
  
  const isFixed = result.primaryGenre === 'hip hop' && result.recommendationMetrics?.tasteScore < 30;
  console.log('\n' + (isFixed ? '✅ Kid Koala FIXED!' : '❌ Kid Koala still broken'));
}

testKidKoala();

