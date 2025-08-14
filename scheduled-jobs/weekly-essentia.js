const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const ESSENTIA_SERVICE_URL = 'https://tiko-essentia-audio-service-2eff1b2af167.herokuapp.com';

async function weeklyEssentiaJob() {
  console.log('🕒 WEEKLY ESSENTIA ANALYSIS JOB STARTED');
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  try {
    const db = client.db('test');
    
    // Find artists ready for Essentia analysis (limit to prevent timeout)
    const readyArtists = await db.collection('artistGenres').find({
      spotifyId: { $exists: true, $ne: null },
      topTracks: { $exists: true, $ne: [] },
      essentiaProfileBuilt: { $ne: true },
      needsEssentiaAnalysis: true
    }).limit(25).toArray(); // Process 25 artists per week
    
    console.log(`🎵 Found ${readyArtists.length} artists ready for Essentia analysis`);
    
    if (readyArtists.length === 0) {
      console.log('✅ No artists ready for analysis - job complete');
      process.exit(0);
    }
    
    let analyzed = 0;
    let failed = 0;
    
    for (let i = 0; i < readyArtists.length; i++) {
      const artist = readyArtists[i];
      const artistName = artist.artistName || artist.artist;
      
      try {
        console.log(`🎤 [${i+1}/${readyArtists.length}] Analyzing: ${artistName}`);
        
        const response = await fetch(`${ESSENTIA_SERVICE_URL}/api/analyze-artist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artistName: artistName,
            spotifyId: artist.spotifyId,
            existingGenres: artist.genres || [],
            maxTracks: 10,
            includeRecentReleases: true
          }),
          timeout: 120000 // 2 minute timeout per artist
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.trackMatrix) {
            analyzed++;
            console.log(`     ✅ Success: ${result.trackMatrix.length} tracks analyzed`);
            console.log(`     🎵 Audio sources: Spotify(${result.metadata?.audioSources?.spotify || 0}), Apple(${result.metadata?.audioSources?.apple || 0}), Others(${result.metadata?.audioSources?.alternativeSourcesUsed || 0})`);
          } else {
            failed++;
            console.log(`     ⚠️ Analysis failed: ${result.error || 'Unknown error'}`);
          }
        } else {
          failed++;
          console.log(`     ❌ HTTP Error: ${response.status} ${response.statusText}`);
        }
        
        // Rate limiting - 30 seconds between artists to prevent service overload
        if (i < readyArtists.length - 1) {
          console.log(`     ⏳ Waiting 30 seconds before next artist...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
        
      } catch (error) {
        failed++;
        console.error(`     ❌ Failed to analyze ${artistName}: ${error.message}`);
      }
    }
    
    console.log(`\n✅ WEEKLY ESSENTIA ANALYSIS COMPLETE`);
    console.log(`📊 Artists analyzed: ${analyzed}/${readyArtists.length}`);
    console.log(`❌ Failed analyses: ${failed}`);
    console.log(`📈 Success rate: ${((analyzed / readyArtists.length) * 100).toFixed(1)}%`);
    console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    
    // Exit with success
    process.exit(0);
    
  } catch (error) {
    console.error('❌ WEEKLY ESSENTIA JOB FAILED:', error);
    console.error('Stack trace:', error.stack);
    
    // Exit with error code
    process.exit(1);
    
  } finally {
    await client.close();
  }
}

// Run the job
weeklyEssentiaJob().catch(error => {
  console.error('❌ Unhandled error in weekly Essentia job:', error);
  process.exit(1);
});
