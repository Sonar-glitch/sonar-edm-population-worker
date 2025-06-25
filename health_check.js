// Basic Health Check for Architectural Bypass Detection
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

async function checkArchitecturalBypass() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        
        const sourceCount = await db.collection('events_ticketmaster').countDocuments();
        const unifiedCount = await db.collection('events_unified').countDocuments();
        
        console.log("🔍 Architectural Bypass Health Check");
        console.log(`📊 Source events: ${sourceCount}`);
        console.log(`📊 Unified events: ${unifiedCount}`);
        
        if (sourceCount > 0 && unifiedCount === 0) {
            console.log("🚨 ARCHITECTURAL BYPASS DETECTED!");
            console.log("❌ Source events exist but no unified events");
            return false;
        } else if (unifiedCount > 0) {
            console.log("✅ Architectural bypass NOT detected");
            console.log("✅ Unified events collection populated");
            return true;
        } else {
            console.log("ℹ️ No events in either collection (normal for first run)");
            return true;
        }
        
    } catch (error) {
        console.error("❌ Health check failed:", error.message);
        return false;
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    checkArchitecturalBypass().then(healthy => {
        process.exit(healthy ? 0 : 1);
    });
}

module.exports = { checkArchitecturalBypass };
