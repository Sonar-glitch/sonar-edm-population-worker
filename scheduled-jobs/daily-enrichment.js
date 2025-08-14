const { enrichArtistsWithSpotify } = require('../lib/artistProcessor');

async function dailyEnrichmentJob() {
  console.log('🕒 DAILY ENRICHMENT JOB STARTED');
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  
  try {
    // Process larger batches during off-peak hours
    let totalEnriched = 0;
    let batchCount = 0;
    
    // Run up to 10 batches of 50 artists each = 500 artists max per day
    while (batchCount < 10) {
      console.log(`🔄 Processing batch ${batchCount + 1}/10...`);
      
      const enriched = await enrichArtistsWithSpotify(50);
      if (enriched === 0) {
        console.log('✅ No more artists to enrich - job complete');
        break;
      }
      
      totalEnriched += enriched;
      batchCount++;
      
      console.log(`   📊 Batch ${batchCount}: ${enriched} artists enriched (Total: ${totalEnriched})`);
      
      // Brief pause between batches to avoid rate limits
      if (batchCount < 10) {
        console.log('   ⏳ Waiting 5 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log(`\n✅ DAILY ENRICHMENT COMPLETE`);
    console.log(`📊 Total artists enriched: ${totalEnriched}`);
    console.log(`🔄 Batches processed: ${batchCount}`);
    console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    
    // Exit with success
    process.exit(0);
    
  } catch (error) {
    console.error('❌ DAILY ENRICHMENT JOB FAILED:', error);
    console.error('Stack trace:', error.stack);
    
    // Exit with error code
    process.exit(1);
  }
}

// Run the job
dailyEnrichmentJob().catch(error => {
  console.error('❌ Unhandled error in daily enrichment job:', error);
  process.exit(1);
});
