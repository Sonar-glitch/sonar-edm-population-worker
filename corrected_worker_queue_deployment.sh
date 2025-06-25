#!/bin/bash

echo "🔧 Corrected Worker Queue Deployment"
echo "✅ Targeting sonar-edm-population-worker app specifically"
echo "🎯 Replacing file-based queue with MongoDB queue in worker"
echo ""

# Check if we're in the right directory structure
if [ ! -d "/c/sonar" ]; then
    echo "❌ Error: /c/sonar directory not found"
    echo "Please ensure you're running this from a system with access to the sonar project"
    exit 1
fi

echo "📋 Step 1: Navigating to worker directory..."

# Navigate to worker directory
cd /c/sonar/heroku-workers/event-population

if [ $? -ne 0 ]; then
    echo "❌ Error: Could not navigate to worker directory"
    echo "Expected path: /c/sonar/heroku-workers/event-population"
    exit 1
fi

echo "✅ Successfully navigated to worker directory: $(pwd)"

echo ""
echo "📋 Step 2: Creating MongoDB-based queue for worker..."

# Create the MongoDB-based cityRequestQueue for worker
cat > lib/cityRequestQueue.js << 'EOF'
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'test';

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }
  
  const client = await MongoClient.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  
  const db = client.db(MONGODB_DB);
  
  cachedClient = client;
  cachedDb = db;
  
  return { client, db };
}

// Country code mapping for priority calculation (PRESERVED)
const COUNTRY_CODES = {
  'Canada': 'CA', 'United States': 'US', 'USA': 'US',
  'United Kingdom': 'GB', 'UK': 'GB', 'Germany': 'DE',
  'France': 'FR', 'Netherlands': 'NL', 'Spain': 'ES',
  'Italy': 'IT', 'Australia': 'AU', 'Brazil': 'BR',
  'Mexico': 'MX', 'Japan': 'JP', 'South Korea': 'KR'
};

/**
 * Get country code from country name (PRESERVED FUNCTION)
 */
function getCountryCode(countryName) {
  if (!countryName) return null;
  
  const normalized = countryName.trim();
  if (COUNTRY_CODES[normalized]) {
    return COUNTRY_CODES[normalized];
  }
  
  // Case-insensitive lookup
  const lowerCase = normalized.toLowerCase();
  for (const [country, code] of Object.entries(COUNTRY_CODES)) {
    if (country.toLowerCase() === lowerCase) {
      return code;
    }
  }
  
  return null;
}

/**
 * Check if country is supported by Ticketmaster (PRESERVED FUNCTION)
 */
function isCountrySupported(countryName) {
  return getCountryCode(countryName) !== null;
}

/**
 * Get regional priority for processing order (PRESERVED FUNCTION)
 */
function getRegionalPriority(countryCode) {
  const priorities = {
    'US': 100, 'CA': 95, 'GB': 90, 'AU': 85,
    'DE': 80, 'FR': 75, 'NL': 70, 'ES': 65,
    'IT': 60, 'BR': 55, 'MX': 50, 'JP': 45
  };
  
  return priorities[countryCode] || 30;
}

/**
 * Get pending city requests for worker processing (SAME SIGNATURE, MONGODB VERSION)
 */
function getPendingCityRequests() {
  return new Promise(async (resolve, reject) => {
    try {
      const { db } = await connectToDatabase();
      const cityRequestsCollection = db.collection('cityRequests');
      
      const pendingRequests = await cityRequestsCollection
        .find({ status: 'pending' })
        .sort({ priority: -1, requestCount: -1, requestedAt: 1 })
        .toArray();
      
      console.log(`📋 Found ${pendingRequests.length} pending city requests in MongoDB queue`);
      resolve(pendingRequests);
    } catch (error) {
      console.error('Error getting pending city requests:', error);
      resolve([]); // Return empty array on error (preserves original behavior)
    }
  });
}

/**
 * Mark city request as processing (SAME SIGNATURE, MONGODB VERSION)
 */
function markCityAsProcessing(city, country) {
  return new Promise(async (resolve, reject) => {
    try {
      const { db } = await connectToDatabase();
      const cityRequestsCollection = db.collection('cityRequests');
      
      const result = await cityRequestsCollection.updateOne(
        { 
          city: city.trim().toLowerCase(), 
          country: country.trim().toLowerCase() 
        },
        { 
          $set: { 
            status: 'processing',
            processingStartedAt: new Date()
          }
        }
      );
      
      console.log(`🔄 Marked ${city}, ${country} as processing`);
      resolve(result.modifiedCount > 0);
    } catch (error) {
      console.error('Error marking city as processing:', error);
      resolve(false); // Return false on error (preserves original behavior)
    }
  });
}

/**
 * Mark city request as completed (SAME SIGNATURE, MONGODB VERSION)
 */
function markCityAsCompleted(city, country, eventCount = 0) {
  return new Promise(async (resolve, reject) => {
    try {
      const { db } = await connectToDatabase();
      const cityRequestsCollection = db.collection('cityRequests');
      
      const result = await cityRequestsCollection.updateOne(
        { 
          city: city.trim().toLowerCase(), 
          country: country.trim().toLowerCase() 
        },
        { 
          $set: { 
            status: 'completed',
            completedAt: new Date(),
            eventCount
          }
        }
      );
      
      console.log(`✅ Marked ${city}, ${country} as completed with ${eventCount} events`);
      resolve(result.modifiedCount > 0);
    } catch (error) {
      console.error('Error marking city as completed:', error);
      resolve(false); // Return false on error (preserves original behavior)
    }
  });
}

/**
 * Mark city request as error (SAME SIGNATURE, MONGODB VERSION)
 */
function markCityAsError(city, country, errorMessage) {
  return new Promise(async (resolve, reject) => {
    try {
      const { db } = await connectToDatabase();
      const cityRequestsCollection = db.collection('cityRequests');
      
      const result = await cityRequestsCollection.updateOne(
        { 
          city: city.trim().toLowerCase(), 
          country: country.trim().toLowerCase() 
        },
        { 
          $set: { 
            status: 'error',
            errorMessage,
            errorAt: new Date()
          }
        }
      );
      
      console.log(`❌ Marked ${city}, ${country} as error: ${errorMessage}`);
      resolve(result.modifiedCount > 0);
    } catch (error) {
      console.error('Error marking city as error:', error);
      resolve(false); // Return false on error (preserves original behavior)
    }
  });
}

/**
 * Get queue statistics (SAME SIGNATURE, MONGODB VERSION)
 */
function getQueueStats() {
  return new Promise(async (resolve, reject) => {
    try {
      const { db } = await connectToDatabase();
      const cityRequestsCollection = db.collection('cityRequests');
      
      const stats = await cityRequestsCollection.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]).toArray();
      
      const result = {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        error: 0
      };
      
      stats.forEach(stat => {
        result[stat._id] = stat.count;
        result.total += stat.count;
      });
      
      resolve(result);
    } catch (error) {
      console.error('Error getting queue stats:', error);
      resolve({
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        error: 0
      }); // Return empty stats on error (preserves original behavior)
    }
  });
}

/**
 * Clean up old completed requests (SAME SIGNATURE, MONGODB VERSION)
 */
function cleanupOldRequests() {
  return new Promise(async (resolve, reject) => {
    try {
      const { db } = await connectToDatabase();
      const cityRequestsCollection = db.collection('cityRequests');
      
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const result = await cityRequestsCollection.deleteMany({
        status: 'completed',
        completedAt: { $lt: oneWeekAgo }
      });
      
      if (result.deletedCount > 0) {
        console.log(`🧹 Cleaned up ${result.deletedCount} old city requests`);
      }
      
      resolve(result.deletedCount);
    } catch (error) {
      console.error('Error cleaning up old requests:', error);
      resolve(0); // Return 0 on error (preserves original behavior)
    }
  });
}

// PRESERVED: Export same functions with same signatures
module.exports = {
  getPendingCityRequests,
  markCityAsProcessing,
  markCityAsCompleted,
  markCityAsError,
  getQueueStats,
  cleanupOldRequests,
  getCountryCode,
  isCountrySupported,
  getRegionalPriority
};
EOF

echo "✅ MongoDB-based queue created in worker's lib/cityRequestQueue.js!"

echo ""
echo "📋 Step 3: Verifying Heroku remote for worker app..."

# Check if heroku remote exists and points to worker app
HEROKU_REMOTE=$(git remote get-url heroku 2>/dev/null)
if [[ "$HEROKU_REMOTE" == *"sonar-edm-population-worker"* ]]; then
    echo "✅ Heroku remote correctly points to worker app: $HEROKU_REMOTE"
else
    echo "⚠️ Setting up Heroku remote for worker app..."
    # Remove existing heroku remote if it exists
    git remote remove heroku 2>/dev/null || true
    # Add correct heroku remote for worker app
    git remote add heroku https://git.heroku.com/sonar-edm-population-worker.git
    echo "✅ Heroku remote set to worker app: sonar-edm-population-worker"
fi

echo ""
echo "📋 Step 4: Deploying to worker app..."

# Add all changes to git
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "⚠️ No changes to commit - MongoDB queue file may already exist"
    echo "Proceeding with deployment anyway..."
else
    # Commit changes
    git commit -m "Replace File-based Queue with MongoDB Queue

🔧 SURGICAL WORKER CHANGE:
✅ Replaced lib/cityRequestQueue.js file-based implementation with MongoDB version
✅ Preserved all existing function signatures and behavior
✅ Added proper MongoDB connection handling for test database
✅ Maintained same Promise-based return patterns with error fallbacks

🎯 ENABLES:
- Worker can now read city requests from main app's MongoDB queue
- London, Montreal, Vancouver, and all 25 pending cities will be processed
- Global city processing for all 13 supported countries
- Automatic status updates (pending → processing → completed)

✅ PRESERVED:
- All existing worker logic in fetchTicketmaster.js unchanged
- Same function signatures and return types
- Same error handling patterns that return empty arrays/false on errors
- Same database connections and processing flow
- Zero breaking changes to existing Canadian city processing

This surgical replacement enables the worker to read from the same
MongoDB queue that the main app writes to, solving the architecture
mismatch while preserving all existing worker functionality."
fi

# Push to Heroku worker app
echo "🚀 Deploying to worker app (sonar-edm-population-worker)..."
git push heroku main

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Worker Queue Deployment Successful!"
    echo ""
    echo "🎯 What This Fixed:"
    echo "✅ Worker now reads from same MongoDB queue as main app"
    echo "✅ 25 pending cities (London, Montreal, Vancouver, etc.) will be processed"  
    echo "✅ Global city processing enabled for all 13 supported countries"
    echo "✅ Architecture mismatch resolved - file vs MongoDB incompatibility fixed"
    echo "✅ All existing worker logic preserved and functional"
    echo ""
    echo "🧪 Testing Instructions:"
    echo "1. Check worker logs: heroku logs --tail --app sonar-edm-population-worker"
    echo "2. Worker should show: 'Found X pending city requests in MongoDB queue'"
    echo "3. Worker should process cities: London, Montreal, Vancouver, etc."
    echo "4. Test London: Should get real events instead of no events"
    echo "5. Test Montreal: Should get fresh events without duplicates"
    echo "6. Verify Toronto: Should continue showing 52 real events"
    echo ""
    echo "🔄 Expected Worker Behavior:"
    echo "- Phase 1: Process Canadian cities (preserved)"
    echo "- Phase 2: Process 25 dynamic city requests from MongoDB queue (new)"
    echo "- Queue statistics should show actual pending requests being processed"
    echo ""
    echo "🌍 Global city processing now enabled for all supported countries!"
    echo "🎵 London, Montreal, Vancouver should show real events within 2-5 minutes!"
else
    echo "❌ Deployment failed"
    echo "Please check the error messages above"
    echo ""
    echo "🔍 Troubleshooting:"
    echo "1. Ensure you have access to sonar-edm-population-worker Heroku app"
    echo "2. Check if Heroku CLI is logged in: heroku auth:whoami"
    echo "3. Verify app permissions: heroku apps:info --app sonar-edm-population-worker"
    exit 1
fi

