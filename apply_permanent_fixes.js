const fs = require('fs');

console.log('🔧 Applying permanent fixes to lib/recommendationEnhancer.js...');

// Read the current file
let content = fs.readFileSync('lib/recommendationEnhancer.js', 'utf8');

// Fix 1: Update needsEnhancement method
console.log('1. Fixing needsEnhancement method...');
const oldNeedsEnhancement = /needsEnhancement\(event\) \{[\s\S]*?return \(hasNoArtists \|\| hasNoGenres \|\| hasNoScore\) && notProcessed;[\s\S]*?\}/;
const newNeedsEnhancement = `needsEnhancement(event) {
    // Only check if already processed by our enhancement
    const alreadyProcessed = event.enhancementProcessed === true;
    const hasOurScore = event.recommendationMetrics?.tasteScore !== undefined;
    
    // Enhance if not already processed by our system
    return !alreadyProcessed && !hasOurScore;
  }`;

content = content.replace(oldNeedsEnhancement, newNeedsEnhancement);

// Fix 2: Update extractArtists method
console.log('2. Fixing extractArtists method...');
const oldExtractArtists = /extractArtists\(event\) \{[\s\S]*?artists = \[\.\.\.new Set\(artists\)\]\.filter\(artist =>[\s\S]*?\);/;
const newExtractArtists = `extractArtists(event) {
    let artists = [];

    // FIXED: Use artistList first (array of strings)
    if (event.artistList && Array.isArray(event.artistList)) {
      artists = [...event.artistList];
    }
    // FIXED: Extract from artists array (array of objects)  
    else if (event.artists && Array.isArray(event.artists)) {
      artists = event.artists.map(a => a.name || a).filter(Boolean);
    }
    // Extract from event name (last resort)
    else if (event.name) {
      artists = this.parseArtistsFromName(event.name);
    }

    // Remove duplicates and validate
    artists = [...new Set(artists)].filter(artist =>
      typeof artist === 'string' && artist.length > 1 && artist.length < 50
    );`;

content = content.replace(oldExtractArtists, newExtractArtists);

// Write the fixed file
fs.writeFileSync('lib/recommendationEnhancer.js', content);

console.log('✅ Permanent fixes applied successfully!');
console.log('');
console.log('Summary of fixes:');
console.log('- needsEnhancement: Now checks for tasteScore specifically');
console.log('- extractArtists: Now uses artistList and artists arrays properly');
console.log('');
console.log('Next steps:');
console.log('1. git add lib/recommendationEnhancer.js');
console.log('2. git commit -m "Fix recommendation enhancement logic"');
console.log('3. git push heroku main');

