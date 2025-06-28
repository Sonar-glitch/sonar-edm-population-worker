const fs = require('fs');

const currentContent = fs.readFileSync('lib/recommendationEnhancer.js', 'utf8');

const fixedContent = currentContent.replace(
  /needsEnhancement\(event\) \{[\s\S]*?\}/,
  `needsEnhancement(event) {
    // Only check if already processed by our enhancement
    const alreadyProcessed = event.enhancementProcessed === true;
    const hasOurScore = event.recommendationMetrics?.tasteScore !== undefined;
    
    // Enhance if not already processed by our system
    return !alreadyProcessed && !hasOurScore;
  }`
);

fs.writeFileSync('lib/recommendationEnhancer.js', fixedContent);
console.log('✅ Fixed needsEnhancement logic');
