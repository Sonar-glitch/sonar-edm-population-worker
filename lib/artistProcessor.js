/**
 * Artist Extraction and Enrichment Module for Heroku Workers
 * 
 * This module provides functions to extract artists from events and enrich them
 * with Spotify data, designed to be called from the event processing pipeline.
 */

const { MongoClient } = require('mongodb');
const SpotifyWebApi = require('spotify-web-api-node');

const MONGODB_URI = process.env.MONGODB_URI;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET
});

let spotifyAuthenticated = false;

async function authenticateSpotify() {
  if (spotifyAuthenticated) return true;
  
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body.access_token);
    spotifyAuthenticated = true;
    console.log('✅ Spotify authenticated for artist enrichment');
    return true;
  } catch (error) {
    console.error('❌ Spotify authentication failed:', error.message);
    return false;
  }
}

/**
 * Extract artists from a batch of events
 */
async function extractArtistsFromEvents(events) {
  if (!events || events.length === 0) return [];
  
  console.log(`🎵 Extracting artists from ${events.length} events...`);
  
  const extractedArtists = new Set();
  
  for (const event of events) {
    // Extract from performers array
    if (event.performers && Array.isArray(event.performers)) {
      event.performers.forEach(performer => {
        if (performer.name && performer.type === 'musician') {
          extractedArtists.add(performer.name.trim());
        }
      });
    }
    
    // Extract from attractions array (Ticketmaster format)
    if (event.attractions && Array.isArray(event.attractions)) {
      event.attractions.forEach(attraction => {
        if (attraction.name) {
          extractedArtists.add(attraction.name.trim());
        }
      });
    }
    
    // Extract from event name parsing
    if (event.name) {
      const eventName = event.name.toLowerCase();
      // Simple extraction - could be enhanced with NLP
      if (eventName.includes(' presents ') || eventName.includes(' featuring ')) {
        // Extract artist names from event titles
        const parts = event.name.split(/ presents | featuring | with | and /i);
        parts.forEach(part => {
          const cleaned = part.trim().replace(/[^\w\s]/g, '');
          if (cleaned.length > 2 && cleaned.length < 50) {
            extractedArtists.add(cleaned);
          }
        });
      }
    }
  }
  
  const artistsArray = Array.from(extractedArtists);
  console.log(`   ✅ Extracted ${artistsArray.length} unique artists`);
  
  return artistsArray;
}

/**
 * Save extracted artists to artistGenres collection
 */
async function saveArtistsToDatabase(artists) {
  if (!artists || artists.length === 0) return 0;
  
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  try {
    const db = client.db('test');
    const artistGenresCollection = db.collection('artistGenres');
    
    const operations = [];
    const timestamp = new Date();
    
    for (const artistName of artists) {
      operations.push({
        updateOne: {
          filter: { artistName: artistName },
          update: {
            $setOnInsert: {
              artistName: artistName,
              originalName: artistName,
              extractedAt: timestamp,
              source: 'heroku-worker',
              needsSpotifyEnrichment: true,
              needsEssentiaAnalysis: true
            }
          },
          upsert: true
        }
      });
    }
    
    const result = await artistGenresCollection.bulkWrite(operations, { ordered: false });
    console.log(`   ✅ Saved ${result.upsertedCount} new artists to artistGenres`);
    
    return result.upsertedCount;
    
  } finally {
    await client.close();
  }
}

/**
 * Enrich a batch of artists with Spotify data
 */
async function enrichArtistsWithSpotify(maxArtists = 10) {
  if (!await authenticateSpotify()) {
    console.log('   ⚠️ Skipping Spotify enrichment - authentication failed');
    return 0;
  }
  
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  try {
    const db = client.db('test');
    const artistGenresCollection = db.collection('artistGenres');
    
    // Get artists needing enrichment
    const artistsToEnrich = await artistGenresCollection.find({
      needsSpotifyEnrichment: true,
      spotifyId: { $exists: false }
    }).limit(maxArtists).toArray();
    
    if (artistsToEnrich.length === 0) {
      console.log('   ✅ No artists need Spotify enrichment');
      return 0;
    }
    
    console.log(`   🎵 Enriching ${artistsToEnrich.length} artists with Spotify data...`);
    
    let enriched = 0;
    
    for (const artistDoc of artistsToEnrich) {
      try {
        const artistName = artistDoc.originalName || artistDoc.artistName;
        
        // Search for artist on Spotify
        const searchResult = await spotifyApi.searchArtists(artistName, { limit: 1 });
        
        if (searchResult.body.artists.items.length > 0) {
          const spotifyArtist = searchResult.body.artists.items[0];
          
          // Get top tracks
          let topTracks = [];
          try {
            const topTracksData = await spotifyApi.getArtistTopTracks(spotifyArtist.id, 'US');
            topTracks = topTracksData.body.tracks.map(track => ({
              id: track.id,
              name: track.name,
              popularity: track.popularity,
              preview_url: track.preview_url
            }));
          } catch (e) {
            console.warn(`     ⚠️ Could not fetch top tracks for ${artistName}`);
          }
          
          // Update artist with Spotify data
          const updateData = {
            spotifyId: spotifyArtist.id,
            spotifyName: spotifyArtist.name,
            genres: spotifyArtist.genres || [],
            popularity: spotifyArtist.popularity || 0,
            followers: spotifyArtist.followers?.total || 0,
            images: spotifyArtist.images || [],
            topTracks: topTracks,
            enrichedAt: new Date(),
            needsSpotifyEnrichment: false,
            needsEssentiaAnalysis: topTracks.some(track => track.preview_url)
          };
          
          await artistGenresCollection.updateOne(
            { _id: artistDoc._id },
            { $set: updateData }
          );
          
          enriched++;
          
        } else {
          // Mark as not found
          await artistGenresCollection.updateOne(
            { _id: artistDoc._id },
            { 
              $set: { 
                needsSpotifyEnrichment: false,
                spotifyEnrichmentFailed: true,
                enrichedAt: new Date()
              }
            }
          );
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`     ❌ Error enriching ${artistDoc.artistName}: ${error.message}`);
      }
    }
    
    console.log(`   ✅ Successfully enriched ${enriched}/${artistsToEnrich.length} artists`);
    return enriched;
    
  } finally {
    await client.close();
  }
}

/**
 * Main function to extract and enrich artists from events
 * This is called by the Heroku worker after processing events
 */
async function extractAndEnrichArtists(events) {
  try {
    console.log('\n🎵 Starting artist extraction and enrichment...');
    
    // Step 1: Extract artists from events
    const extractedArtists = await extractArtistsFromEvents(events);
    
    // Step 2: Save new artists to database
    const newArtists = await saveArtistsToDatabase(extractedArtists);
    
    // Step 3: Enrich a batch of artists with Spotify data
    const enrichedArtists = await enrichArtistsWithSpotify(20); // Increased batch size for better throughput
    
    console.log(`✅ Artist processing complete: ${newArtists} new, ${enrichedArtists} enriched`);
    
  } catch (error) {
    console.error('❌ Artist extraction/enrichment failed:', error.message);
  }
}

module.exports = {
  extractAndEnrichArtists,
  extractArtistsFromEvents,
  saveArtistsToDatabase,
  enrichArtistsWithSpotify
};
