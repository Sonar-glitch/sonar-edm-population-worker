#!/usr/bin/env node

/**
 * TIKO Enhancement Pipeline Performance Monitor
 * 
 * Comprehensive monitoring script that tracks:
 * 1. Enhancement entry creation and timing
 * 2. Pipeline stages performance
 * 3. Database operations metrics
 * 4. API success rates
 * 5. Error tracking and alerts
 */

// Load environment variables if dotenv is available
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, use environment variables directly
}
const { MongoClient } = require('mongodb');

class PipelinePerformanceMonitor {
  constructor() {
  // Use environment-provided MongoDB URI. Do NOT store credentials in source.
  // For local development, set MONGODB_URI to e.g. 'mongodb://localhost:27017/test'
  this.mongoUrl = process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://localhost:27017/test';
    this.db = null;
    this.metrics = {
      enhancementEntries: {
        created: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        avgProcessingTime: 0
      },
      pipelineStages: {
        phase1: { processed: 0, avgTime: 0, errors: 0 },
        enhancement: { processed: 0, avgTime: 0, errors: 0 },
        integration: { processed: 0, avgTime: 0, errors: 0 }
      },
      database: {
        eventsTotal: 0,
        eventsEnhanced: 0,
        enhancementCoverage: 0,
        recentActivity: []
      },
      apis: {
        spotify: { calls: 0, successes: 0, failures: 0, avgResponseTime: 0 },
        soundstat: { calls: 0, successes: 0, failures: 0, avgResponseTime: 0 },
        essentia: { calls: 0, successes: 0, failures: 0, avgResponseTime: 0 }
      }
    };
  }

  async connect() {
    try {
      this.client = new MongoClient(this.mongoUrl);
      await this.client.connect();
      this.db = this.client.db('test'); // ✅ CORRECT: Using 'test' database as per project docs
      console.log('✅ Connected to MongoDB for monitoring');
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }

  // 1. ENHANCEMENT ENTRY CREATION TRACKING
  async analyzeEnhancementEntries(timeRange = 24) {
    const hoursAgo = new Date(Date.now() - (timeRange * 60 * 60 * 1000));
    
    console.log(`\n🔍 ENHANCEMENT ENTRIES ANALYSIS (Last ${timeRange}h)`);
    console.log('═══════════════════════════════════════════════');

    try {
      // Count events by enhancement status
      const enhancementStats = await this.db.collection('events_unified').aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            enhanced: [
              { $match: { enhancementProcessed: true } },
              { $count: "count" }
            ],
            recentlyEnhanced: [
              { 
                $match: { 
                  enhancementTimestamp: { $gte: hoursAgo },
                  enhancementProcessed: true
                }
              },
              { $count: "count" }
            ],
            processingTimes: [
              {
                $match: {
                  enhancementTimestamp: { $gte: hoursAgo },
                  enhancementProcessed: true,
                  'enhancementMetadata.processingTime': { $exists: true }
                }
              },
              {
                $group: {
                  _id: null,
                  avgProcessingTime: { $avg: '$enhancementMetadata.processingTime' },
                  minProcessingTime: { $min: '$enhancementMetadata.processingTime' },
                  maxProcessingTime: { $max: '$enhancementMetadata.processingTime' }
                }
              }
            ],
            enhancementVersions: [
              {
                $match: { enhancementVersion: { $exists: true } }
              },
              {
                $group: {
                  _id: '$enhancementVersion',
                  count: { $sum: 1 }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ]).toArray();

      const stats = enhancementStats[0];
      const totalEvents = stats.total[0]?.count || 0;
      const enhancedEvents = stats.enhanced[0]?.count || 0;
      const recentlyEnhanced = stats.recentlyEnhanced[0]?.count || 0;
      const timingData = stats.processingTimes[0] || {};

      this.metrics.database.eventsTotal = totalEvents;
      this.metrics.database.eventsEnhanced = enhancedEvents;
      this.metrics.database.enhancementCoverage = totalEvents > 0 ? (enhancedEvents / totalEvents * 100) : 0;
      this.metrics.enhancementEntries.created = recentlyEnhanced;
      this.metrics.enhancementEntries.avgProcessingTime = timingData.avgProcessingTime || 0;

      console.log(`📊 Total Events: ${totalEvents.toLocaleString()}`);
      console.log(`✅ Enhanced Events: ${enhancedEvents.toLocaleString()} (${this.metrics.database.enhancementCoverage.toFixed(1)}%)`);
      console.log(`🆕 Recently Enhanced: ${recentlyEnhanced.toLocaleString()}`);
      
      if (timingData.avgProcessingTime) {
        console.log(`⏱️  Avg Processing Time: ${(timingData.avgProcessingTime / 1000).toFixed(2)}s`);
        console.log(`⚡ Min/Max Processing Time: ${(timingData.minProcessingTime / 1000).toFixed(2)}s / ${(timingData.maxProcessingTime / 1000).toFixed(2)}s`);
      }

      console.log('\n📋 Enhancement Versions:');
      stats.enhancementVersions.forEach(version => {
        console.log(`   ${version._id}: ${version.count.toLocaleString()} events`);
      });

    } catch (error) {
      console.error('❌ Enhancement entries analysis failed:', error.message);
    }
  }

  // 2. PIPELINE STAGES PERFORMANCE
  async analyzePipelineStages() {
    console.log('\n⚙️  PIPELINE STAGES PERFORMANCE');
    console.log('═════════════════════════════════════════');

    try {
      // Analyze different enhancement stages
      const stageAnalysis = await this.db.collection('events_unified').aggregate([
        {
          $facet: {
            phase1Only: [
              {
                $match: {
                  artistDetails: { $exists: true },
                  enhancementProcessed: { $ne: true }
                }
              },
              { $count: "count" }
            ],
            fullEnhancement: [
              {
                $match: {
                  enhancementProcessed: true,
                  personalizedScore: { $exists: true }
                }
              },
              { $count: "count" }
            ],
            musicApiIntegration: [
              {
                $match: {
                  'enhancementMetadata.musicApiData': { $exists: true }
                }
              },
              { $count: "count" }
            ],
            essentiaIntegration: [
              {
                $match: {
                  'enhancementMetadata.essentiaAnalysis': { $exists: true }
                }
              },
              { $count: "count" }
            ]
          }
        }
      ]).toArray();

      const stages = stageAnalysis[0];
      
      console.log(`🎯 Phase 1 Only: ${(stages.phase1Only[0]?.count || 0).toLocaleString()}`);
      console.log(`🔧 Full Enhancement: ${(stages.fullEnhancement[0]?.count || 0).toLocaleString()}`);
      console.log(`🎵 Music API Integration: ${(stages.musicApiIntegration[0]?.count || 0).toLocaleString()}`);
      console.log(`🧠 Essentia Integration: ${(stages.essentiaIntegration[0]?.count || 0).toLocaleString()}`);

    } catch (error) {
      console.error('❌ Pipeline stages analysis failed:', error.message);
    }
  }

  // 3. RECENT ACTIVITY TRACKING
  async trackRecentActivity(hours = 6) {
    const hoursAgo = new Date(Date.now() - (hours * 60 * 60 * 1000));
    
    console.log(`\n📈 RECENT ACTIVITY (Last ${hours}h)`);
    console.log('═══════════════════════════════════════');

    try {
      // Get recent enhancement activity
      const recentActivity = await this.db.collection('events_unified')
        .find({
          enhancementTimestamp: { $gte: hoursAgo }
        })
        .sort({ enhancementTimestamp: -1 })
        .limit(10)
        .project({
          name: 1,
          enhancementTimestamp: 1,
          enhancementVersion: 1,
          personalizedScore: 1,
          'enhancementMetadata.processingTime': 1,
          'artistDetails.primaryGenre': 1
        })
        .toArray();

      if (recentActivity.length === 0) {
        console.log('📭 No recent enhancement activity found');
        return;
      }

      console.log(`📋 ${recentActivity.length} Recent Enhancements:`);
      recentActivity.forEach((event, index) => {
        const processingTime = event.enhancementMetadata?.processingTime;
        const score = event.personalizedScore || 'N/A';
        const genre = event.artistDetails?.primaryGenre || 'Unknown';
        const timestamp = new Date(event.enhancementTimestamp).toLocaleTimeString();
        
        console.log(`   ${index + 1}. ${event.name}`);
        console.log(`      ⏰ ${timestamp} | 🎯 Score: ${score} | 🎵 ${genre}${processingTime ? ` | ⚡ ${(processingTime/1000).toFixed(2)}s` : ''}`);
      });

    } catch (error) {
      console.error('❌ Recent activity tracking failed:', error.message);
    }
  }

  // 4. ERROR TRACKING AND ALERTS
  async analyzeErrors() {
    console.log('\n🚨 ERROR ANALYSIS');
    console.log('═════════════════════════════');

    try {
      // Look for events with enhancement errors
      const errorAnalysis = await this.db.collection('events_unified').aggregate([
        {
          $match: {
            'enhancementMetadata.errors': { $exists: true, $ne: [] }
          }
        },
        {
          $unwind: '$enhancementMetadata.errors'
        },
        {
          $group: {
            _id: '$enhancementMetadata.errors.type',
            count: { $sum: 1 },
            examples: { $push: '$enhancementMetadata.errors.message' }
          }
        },
        { $sort: { count: -1 } }
      ]).toArray();

      if (errorAnalysis.length === 0) {
        console.log('✅ No enhancement errors found in recent data');
        return;
      }

      console.log('🔴 Enhancement Errors by Type:');
      errorAnalysis.forEach(error => {
        console.log(`   ${error._id}: ${error.count} occurrences`);
        console.log(`      Example: ${error.examples[0]}`);
      });

    } catch (error) {
      console.error('❌ Error analysis failed:', error.message);
    }
  }

  // 5. PERFORMANCE RECOMMENDATIONS
  generateRecommendations() {
    console.log('\n💡 PERFORMANCE RECOMMENDATIONS');
    console.log('═══════════════════════════════════════');

    const { enhancementCoverage, eventsTotal } = this.metrics.database;
    const { avgProcessingTime } = this.metrics.enhancementEntries;

    if (enhancementCoverage < 50) {
      console.log('⚠️  LOW COVERAGE: Enhancement coverage is below 50%');
      console.log('   → Consider running batch enhancement: node enhance_existing_events.js');
    }

    if (avgProcessingTime > 5000) {
      console.log('⚠️  SLOW PROCESSING: Average processing time > 5s');
      console.log('   → Consider optimizing API calls or implementing caching');
    }

    if (eventsTotal > 10000 && enhancementCoverage > 80) {
      console.log('✅ HEALTHY: Good coverage on large dataset');
      console.log('   → Monitor for performance degradation as dataset grows');
    }

    console.log('\n📋 Monitoring Commands:');
    console.log('   node pipeline_performance_monitor.js --live    # Real-time monitoring');
    console.log('   node pipeline_performance_monitor.js --report  # Generate full report');
    console.log('   node pipeline_performance_monitor.js --alerts  # Check for issues');
  }

  // 6. LIVE MONITORING MODE
  async startLiveMonitoring() {
    console.log('\n🔴 LIVE MONITORING MODE STARTED');
    console.log('Press Ctrl+C to stop\n');

    const monitorLoop = async () => {
      try {
        console.clear();
        console.log('📊 TIKO PIPELINE LIVE MONITOR');
        console.log('═══════════════════════════════');
        console.log(`🕒 ${new Date().toLocaleString()}\n`);

        await this.analyzeEnhancementEntries(1); // Last hour
        await this.trackRecentActivity(1); // Last hour
        
        console.log('\n🔄 Refreshing in 30 seconds...');
      } catch (error) {
        console.error('❌ Monitoring error:', error.message);
      }
    };

    // Run initial check
    await monitorLoop();

    // Set up interval
    const interval = setInterval(monitorLoop, 30000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n👋 Live monitoring stopped');
      this.disconnect();
      process.exit(0);
    });
  }

  // Main execution method
  async run() {
    const args = process.argv.slice(2);
    const mode = args[0];

    await this.connect();

    try {
      if (mode === '--live') {
        await this.startLiveMonitoring();
      } else if (mode === '--alerts') {
        await this.analyzeErrors();
      } else {
        // Full report (default)
        console.log('🎯 TIKO ENHANCEMENT PIPELINE PERFORMANCE REPORT');
        console.log('════════════════════════════════════════════════════');
        console.log(`📅 Generated: ${new Date().toLocaleString()}\n`);

        await this.analyzeEnhancementEntries();
        await this.analyzePipelineStages();
        await this.trackRecentActivity();
        await this.analyzeErrors();
        this.generateRecommendations();
      }
    } finally {
      if (mode !== '--live') {
        await this.disconnect();
      }
    }
  }
}

// Execute if run directly
if (require.main === module) {
  const monitor = new PipelinePerformanceMonitor();
  monitor.run().catch(error => {
    console.error('💥 Monitor failed:', error);
    process.exit(1);
  });
}

module.exports = PipelinePerformanceMonitor;
