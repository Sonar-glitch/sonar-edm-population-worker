const fs = require('fs');

// Read current file
const currentContent = fs.readFileSync('lib/recommendationEnhancer.js', 'utf8');

// Fix the extractArtists method to work with processed events
const fixedContent = currentContent.replace(
  /extractArtists\(event\) \{[\s\S]*?return \{/,
  `extractArtists(event) {
    let artists = [];

    // FIXED: Use processed event structure
    // Priority 1: Use existing artistList (already processed)
    if (event.artistList && Array.isArray(event.artistList)) {
      artists = [...event.artistList];
    }
    
    // Priority 2: Extract from artists array
    else if (event.artists && Array.isArray(event.artists)) {
      artists = event.artists.map(a => a.name || a).filter(Boolean);
    }

    // Priority 3: Extract from event name (fallback)
    else if (event.name) {
      const nameArtists = this.parseArtistsFromName(event.name);
      artists = [...nameArtists];
    }

    // Remove duplicates and validate
    artists = [...new Set(artists)].filter(artist =>
      typeof artist === 'string' && artist.length > 1 && artist.length < 50
    );

    return {`
);

fs.writeFileSync('lib/recommendationEnhancer.js', fixedContent);
console.log('✅ Fixed extractArtists method for processed events');
