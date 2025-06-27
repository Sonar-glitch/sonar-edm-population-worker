// Validation script for surgical recommendation fix
const { RecommendationEnhancer } = require('./lib/recommendationEnhancer');

async function validateFix() {
  console.log('🧪 Validating Surgical Recommendation Fix...\n');
  
  // Test event (Kid Koala - should be properly classified now)
  const testEvent = {
    name: "Kid Koala - The Storyville Mosquito",
    _embedded: {
      attractions: [{ name: "Kid Koala" }]
    },
    genre: "dance/electronic", // Wrong Ticketmaster classification
    venue: { name: "The Phoenix Concert Theatre" }
  };
  
  const enhancer = new RecommendationEnhancer();
  enhancer.enabled = true; // Force enable for testing
  
  const result = await enhancer.enhanceEvent(testEvent);
  
  console.log('🎯 Validation Results:');
  console.log(`Event: ${result.name}`);
  console.log(`Artists: [${result.artists?.join(', ') || 'none'}]`);
  console.log(`Primary Genre: ${result.primaryGenre}`);
  console.log(`Is EDM Event: ${result.isEdmEvent}`);
  console.log(`Taste Score: ${result.recommendationMetrics?.tasteScore || 0}%`);
  console.log(`Enhancement Success: ${result.enhancementProcessed}`);
  
  // Validate Kid Koala is correctly processed
  const isCorrect = result.primaryGenre === 'hip hop' && 
                   !result.isEdmEvent && 
                   result.recommendationMetrics?.tasteScore < 30;
  
  console.log(`\n${isCorrect ? '✅' : '❌'} Kid Koala Classification: ${isCorrect ? 'FIXED' : 'STILL BROKEN'}`);
  
  return isCorrect;
}

if (require.main === module) {
  validateFix();
}

module.exports = { validateFix };
