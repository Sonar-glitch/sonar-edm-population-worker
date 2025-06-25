const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
mongoose.connection.once('open', async () => {
  const db = mongoose.connection.db;

  const eventsToCheck = [
    {
      name: 'Excision & Deadmau5 at CODA - Toronto',
      url: 'https://www.codatoronto.com/tickets/events/2025-06-28-excision-mch2mn73kt0'
    },
    {
      name: 'Deadmau5 & Crystal Castles at Scotiabank Arena - Toronto',
      url: 'https://www.ticketmaster.ca/scotiabank-arena-tickets-toronto/event/2025-06-27-deadmau5-scotiabank-arena-mcivzlwffn8/venue/131599'
    }
  ];

  for (const eventData of eventsToCheck ) {
    const foundEvent = await db.collection('events_unified').findOne({ name: eventData.name });
    if (foundEvent) {
      console.log(`Event: ${foundEvent.name}\n  Source: ${foundEvent.source}\n  URL: ${foundEvent.url}`);
    } else {
      console.log(`Event not found: ${eventData.name}`);
    }
  }

  process.exit(0);
});