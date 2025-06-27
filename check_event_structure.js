const mongoose = require('mongoose');

async function checkEventStructure() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    const event = await db.collection('events_unified').findOne({
      enhancementProcessed: { $ne: true }
    });
    
    console.log('Event structure:');
    console.log(JSON.stringify(event, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkEventStructure();
