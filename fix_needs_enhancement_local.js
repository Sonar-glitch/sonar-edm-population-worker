const fs = require('fs');

let content = fs.readFileSync('lib/recommendationEnhancer.js', 'utf8');

// Replace the broken needsEnhancement method
const oldPattern = /needsEnhancement\(event\) \{[\s\S]*?return \(hasNoArtists \|\| hasNoGenres \|\| hasNoScore\) && notProcessed;[\s\S]*?\}/;

const newMethod = `needsEnhancement(event) {
    const alreadyProcessed = event.enhancementProcessed === true;
    const hasOurScore = event.recommendationMetrics?.tasteScore !== undefined;
    return !alreadyProcessed && !hasOurScore;
  }`;

content = content.replace(oldPattern, newMethod);
fs.writeFileSync('lib/recommendationEnhancer.js', content);
console.log('Fixed needsEnhancement method locally');
