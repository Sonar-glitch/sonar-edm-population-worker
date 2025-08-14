const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const ESSENTIA_SERVICE_URL = 'https://tiko-essentia-audio-service-2eff1b2af167.herokuapp.com';

async function dailyEssentiaJob() {
  console.log('🕒 DAILY ESSENTIA ANALYSIS JOB STARTED');
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  try {
    const db = client.db('test');
    
    // Check if today is Sunday (0 = Sunday in JavaScript)
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // Run larger batch on Sundays, smaller daily batches on other days
    const isWeeeklyDay = dayOfWeek === 0; // Sunday
    const batchSize = isWeeeklyDay ? 25 : 5; // 25 on Sunday, 5 on other days
    
    console.log(`📅 Day of week: ${dayOfWeek} (${isWeeeklyDay ? 'Sunday - Large batch' : 'Weekday - Small batch'})`);
    console.log(`🎯 Processing ${batchSize} artists`);
    
    // Find artists ready for Essentia analysis
    const readyArtists = await db.collection('artistGenres').find({
      spotifyId: { $exists: true, $ne: null },
      topTracks: { $exists: true, $ne: [] },
      essentiaProfileBuilt: { $ne: true },
      needsEssentiaAnalysis: true
    }).limit(batchSize).toArray();
    
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
        
        // Rate limiting - different delays based on batch size
        const delay = isWeeeklyDay ? 30000 : 15000; // 30s on Sunday, 15s on weekdays
        if (i < readyArtists.length - 1) {
          console.log(`     ⏳ Waiting ${delay/1000} seconds before next artist...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        failed++;
        console.error(`     ❌ Failed to analyze ${artistName}: ${error.message}`);
      }
    }
    
    console.log(`\n✅ DAILY ESSENTIA ANALYSIS COMPLETE`);
    console.log(`📊 Artists analyzed: ${analyzed}/${readyArtists.length}`);
    console.log(`❌ Failed analyses: ${failed}`);
    console.log(`📈 Success rate: ${((analyzed / readyArtists.length) * 100).toFixed(1)}%`);
    console.log(`📅 Batch type: ${isWeeeklyDay ? 'Weekly (Sunday)' : 'Daily'}`);
    console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    
    // Exit with success
    process.exit(0);
    
  } catch (error) {
    console.error('❌ DAILY ESSENTIA JOB FAILED:', error);
    console.error('Stack trace:', error.stack);
    
    // Exit with error code
    process.exit(1);
    
  } finally {
    await client.close();
  }
}

// Run the job
dailyEssentiaJob().catch(error => {
  console.error('❌ Unhandled error in daily Essentia job:', error);
  process.exit(1);
});
