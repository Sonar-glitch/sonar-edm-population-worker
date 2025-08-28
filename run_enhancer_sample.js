require('dotenv').config();
const mongoose = require('mongoose');
const TicketmasterEvent = require('./models/TicketmasterEvent');
const RecommendationEnhancer = require('./lib/recommendationEnhancer');

async function runSample() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set in environment');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected for enhancer sample');

    const event = await TicketmasterEvent.findOne({}).lean();
    if (!event) {
      console.log('No TicketmasterEvent found to test');
      return process.exit(0);
    }

    console.log('Sample event loaded:', event.name || event.id || event._id);

    const enhancer = new RecommendationEnhancer();
    enhancer.enabled = true; // force enable for dry run

    console.log('Running enhancer.enhanceEvent on sample...');
    const enhanced = await enhancer.enhanceEvent(event, { userPreferences: { primaryGenre: 'electronic' } });

    console.log('\n=== ENHANCEMENT RESULT ===');
    console.log('enhancementProcessed:', enhanced.enhancementProcessed);
    console.log('enhancementVersion:', enhanced.enhancementVersion);
    console.log('personalizedScore:', enhanced.personalizedScore);
    console.log('artists (first):', enhanced.artists && enhanced.artists.slice(0,3));
    console.log('\nFull enhanced event (truncated):', JSON.stringify(enhanced, null, 2).slice(0, 2000));

    await mongoose.disconnect();
    process.exit(0);

  } catch (err) {
    console.error('Error during sample enhancement:', err && err.message);
    console.error(err && err.stack);
    try { await mongoose.disconnect(); } catch(e){}
    process.exit(1);
  }
}

runSample();
