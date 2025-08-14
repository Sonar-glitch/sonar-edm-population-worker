#!/bin/bash

echo "🚀 DEPLOYING ENHANCED HEROKU WORKER WITH AUTOMATIC TRIGGERS"
echo "=========================================================="

cd /c/sonar/heroku-workers/event-population

echo "📦 Committing changes..."
git add .
git commit -m "Enhanced automatic triggers - increased batch size + scheduled jobs"

echo "🚢 Deploying to Heroku..."
git push heroku main

echo "⏰ Setting up Heroku Scheduler (if not already configured)..."
echo "Note: You may need to manually add the scheduler addon and configure jobs"

echo ""
echo "📋 MANUAL STEPS REQUIRED:"
echo "========================="
echo "1. Add Heroku Scheduler addon (if not exists):"
echo "   heroku addons:create scheduler:standard -a sonar-edm-population-worker"
echo ""
echo "2. Configure scheduled jobs:"
echo "   heroku addons:open scheduler -a sonar-edm-population-worker"
echo ""
echo "3. Add these jobs in the Heroku Scheduler dashboard:"
echo "   📅 Daily Enrichment (2 AM UTC):"
echo "      Command: node scheduled-jobs/daily-enrichment.js"
echo "      Schedule: 0 2 * * * (daily at 2 AM)"
echo ""
echo "   📅 Weekly Essentia (Sunday 3 AM UTC):"
echo "      Command: node scheduled-jobs/weekly-essentia.js" 
echo "      Schedule: 0 3 * * 0 (Sunday at 3 AM)"
echo ""
echo "4. Test the scheduled jobs:"
echo "   heroku run node scheduled-jobs/daily-enrichment.js -a sonar-edm-population-worker"
echo "   heroku run node scheduled-jobs/weekly-essentia.js -a sonar-edm-population-worker"
echo ""
echo "✅ Deployment complete! Your automatic trigger system is ready."
echo "🔄 Real-time triggers: Events → Artists → Spotify (20 at a time)"
echo "📅 Daily triggers: Clear Spotify enrichment backlog (500 artists)"  
echo "🧠 Weekly triggers: Essentia ML analysis (25 artists)"
