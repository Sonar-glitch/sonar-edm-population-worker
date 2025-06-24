const { invalidateCache } = require("../lib/cache");

async function run() {
  try {
    console.log("Attempting to invalidate 'events_' cache...");
    const deletedCount = await invalidateCache("^events_");
    console.log(`Successfully invalidated ${deletedCount} cache entries matching 'events_'.`);
  } catch (error) {
    console.error("Error invalidating cache:", error);
  } finally {
    process.exit(0);
  }
}

run();
