#!/usr/bin/env node
/**
 * ESSENTIA-BASED AUDIO PROFILE MATRIX BUILDER
 * Uses the deployed Essentia service to build comprehensive audio profiles
 * This replaces deprecated Spotify audio features with advanced ML analysis
 */

const { MongoClient } = require('mongodb');

// Essentia service configuration
const ESSENTIA_SERVICE_URL = process.env.ESSENTIA_SERVICE_URL || 'https://tiko-essentia-audio-service-2eff1b2af167.herokuapp.com';
// Alternative: 'http://localhost:3001' for local development

async function buildEssentiaAudioProfileMatrix() {
  console.log('🎵 BUILDING ESSENTIA-BASED AUDIO PROFILE MATRIX');
  console.log('===============================================');
  
  const fetch = (await import('node-fetch')).default;
  
  const client = new MongoClient('mongodb+srv://furqanzemail:XJfBasTxNcle2CEs@sonaredm.g4cdx.mongodb.net/test?retryWrites=true&w=majority&appName=SonarEDM');
  await client.connect();
  const db = client.db('test');
  const artistGenresCollection = db.collection('artistGenres');
  
  // Verify Essentia service is available
  try {
    const healthCheck = await fetch(`${ESSENTIA_SERVICE_URL}/health`);
    if (!healthCheck.ok) {
      throw new Error(`Essentia service health check failed: ${healthCheck.status}`);
    }
    console.log('✅ Essentia service is online and ready');
  } catch (error) {
    console.error('❌ Essentia service unavailable:', error.message);
    process.exit(1);
  }
  
  // Get all artists without Essentia audio profiles
  const artistsToProcess = await artistGenresCollection.find({
    essentiaAudioProfile: { $exists: false }
  }).toArray();
  
  console.log(`\n📊 Artists to process: ${artistsToProcess.length}`);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  
  for (const artist of artistsToProcess) {
    try {
      console.log(`\n[${processed + 1}/${artistsToProcess.length}] Processing: ${artist.originalName}`);
      
      // Build Essentia-based audio profile
      const audioProfile = await buildEssentiaArtistProfile(artist);
      
      if (audioProfile.success) {
        // Update artist in database
        await artistGenresCollection.updateOne(
          { _id: artist._id },
          { 
            $set: { 
              essentiaAudioProfile: audioProfile.profile,
              spotifyTrackData: audioProfile.spotifyData,
              essentiaProfileBuilt: true,
              essentiaProfileDate: new Date(),
              essentiaVersion: '1.0'
            }
          }
        );
        
        successful++;
        console.log(`   ✅ Essentia profile built: ${audioProfile.profile.tracks.length} tracks analyzed`);
        console.log(`   🎧 Avg Energy: ${audioProfile.profile.averageFeatures.energy?.toFixed(2) || 'N/A'}`);
        console.log(`   💃 Avg Danceability: ${audioProfile.profile.averageFeatures.danceability?.toFixed(2) || 'N/A'}`);
        console.log(`   🎼 Spectral Analysis: ${audioProfile.profile.spectralFeatures ? 'Available' : 'N/A'}`);
      } else {
        failed++;
        console.log(`   ❌ Failed: ${audioProfile.error}`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${artist.originalName}:`, error.message);
      failed++;
    }
    
    processed++;
    
    // Progress update every 5 artists (Essentia is slower than Spotify)
    if (processed % 5 === 0) {
      console.log(`\n📈 PROGRESS: ${processed}/${artistsToProcess.length}`);
      console.log(`   Successful: ${successful}`);
      console.log(`   Failed: ${failed}`);
      console.log(`   Success rate: ${((successful/processed)*100).toFixed(1)}%`);
    }
    
    // Rate limiting - Essentia analysis is resource intensive
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
  }
  
  console.log(`\n✅ ESSENTIA AUDIO PROFILE MATRIX COMPLETE:`);
  console.log(`   Artists processed: ${processed}`);
  console.log(`   Successful profiles: ${successful}`);
  console.log(`   Failed profiles: ${failed}`);
  console.log(`   Success rate: ${((successful/processed)*100).toFixed(1)}%`);
  
  // Verify the results
  const artistsWithEssentiaProfiles = await artistGenresCollection.countDocuments({
    essentiaAudioProfile: { $exists: true }
  });
  
  const totalArtists = await artistGenresCollection.countDocuments();
  
  console.log(`\n📊 FINAL STATUS:`);
  console.log(`   Artists with Essentia profiles: ${artistsWithEssentiaProfiles}/${totalArtists}`);
  console.log(`   Coverage: ${((artistsWithEssentiaProfiles/totalArtists)*100).toFixed(1)}%`);
  
  await client.close();
}

/**
 * Build comprehensive Essentia-based audio profile for a single artist
 */
async function buildEssentiaArtistProfile(artist) {
  try {
    // Step 1: Get top tracks from Spotify (for track URLs, not audio features)
    const spotifyTracks = await getArtistTracksFromSpotify(artist);
    
    if (!spotifyTracks.success || spotifyTracks.tracks.length === 0) {
      return { success: false, error: 'No tracks found on Spotify' };
    }
    
    console.log(`   🔍 Found ${spotifyTracks.tracks.length} tracks from Spotify`);
    
    // Step 2: Analyze each track with Essentia service
    const trackProfiles = [];
    const maxTracks = Math.min(spotifyTracks.tracks.length, 20); // Max 20 tracks as requested
    
    for (let i = 0; i < maxTracks; i++) {
      const track = spotifyTracks.tracks[i];
      
      if (track.preview_url) {
        console.log(`     Analyzing track ${i+1}/${maxTracks}: ${track.name}...`);
        
        const essentiaAnalysis = await analyzeTrackWithEssentia(track.preview_url, track);
        
        if (essentiaAnalysis.success) {
          trackProfiles.push({
            id: track.id,
            name: track.name,
            artist: track.artists[0]?.name,
            popularity: track.popularity,
            previewUrl: track.preview_url,
            durationMs: track.duration_ms,
            essentiaFeatures: essentiaAnalysis.features,
            spotifyData: {
              explicit: track.explicit,
              album: track.album?.name,
              releaseDate: track.album?.release_date
            },
            analyzedAt: new Date()
          });
          
          console.log(`       ✅ Essentia analysis complete`);
        } else {
          console.log(`       ⚠️ Essentia analysis failed: ${essentiaAnalysis.error}`);
        }
        
        // Small delay between track analyses
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.log(`     ⚠️ No preview URL for: ${track.name}`);
      }
    }
    
    if (trackProfiles.length === 0) {
      return { success: false, error: 'No tracks could be analyzed with Essentia' };
    }
    
    // Step 3: Calculate aggregate features across all analyzed tracks
    const averageFeatures = calculateAverageEssentiaFeatures(trackProfiles);
    const spectralFeatures = calculateSpectralFeatures(trackProfiles);
    
    // Step 4: Build complete Essentia audio profile
    const essentiaProfile = {
      tracks: trackProfiles,
      trackCount: trackProfiles.length,
      successfulAnalyses: trackProfiles.length,
      totalTracksAttempted: maxTracks,
      averageFeatures: averageFeatures,
      spectralFeatures: spectralFeatures,
      profileBuiltAt: new Date(),
      essentiaVersion: '1.0',
      source: 'essentia_ml_analysis'
    };
    
    return { 
      success: true, 
      profile: essentiaProfile, 
      spotifyData: {
        totalTracks: spotifyTracks.tracks.length,
        tracksWithPreviews: spotifyTracks.tracks.filter(t => t.preview_url).length
      }
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get artist tracks from Spotify (for preview URLs, not deprecated audio features)
 */
async function getArtistTracksFromSpotify(artist) {
  try {
    // Use your existing Spotify integration
    const SpotifyApi = require('spotify-web-api-node');
    
    const spotifyApi = new SpotifyApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    });
    
    // Get access token
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    
    let spotifyArtistId = artist.spotifyId;
    
    // Search for artist if no ID
    if (!spotifyArtistId) {
      const searchResults = await spotifyApi.searchArtists(artist.originalName, { limit: 1 });
      if (searchResults.body.artists.items.length > 0) {
        spotifyArtistId = searchResults.body.artists.items[0].id;
      } else {
        return { success: false, error: 'Artist not found on Spotify' };
      }
    }
    
    // Get top tracks
    const topTracksData = await spotifyApi.getArtistTopTracks(spotifyArtistId, 'US');
    const tracks = topTracksData.body.tracks;
    
    return { success: true, tracks: tracks };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Analyze a single track with Essentia service
 */
async function analyzeTrackWithEssentia(audioUrl, trackMetadata) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(`${ESSENTIA_SERVICE_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audioUrl: audioUrl,
        trackId: trackMetadata.id,
        trackMetadata: {
          name: trackMetadata.name,
          artist: trackMetadata.artists[0]?.name,
          id: trackMetadata.id
        }
      }),
      timeout: 30000 // 30 second timeout for analysis
    });
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    
    const analysisResult = await response.json();
    
    if (analysisResult.success) {
      return {
        success: true,
        features: analysisResult.features
      };
    } else {
      return { success: false, error: analysisResult.error || 'Analysis failed' };
    }
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Calculate average Essentia features across all tracks
 */
function calculateAverageEssentiaFeatures(trackProfiles) {
  if (trackProfiles.length === 0) return {};
  
  const features = {};
  const featureCounts = {};
  
  // Aggregate all features
  for (const track of trackProfiles) {
    if (track.essentiaFeatures) {
      for (const [key, value] of Object.entries(track.essentiaFeatures)) {
        if (typeof value === 'number' && !isNaN(value)) {
          features[key] = (features[key] || 0) + value;
          featureCounts[key] = (featureCounts[key] || 0) + 1;
        }
      }
    }
  }
  
  // Calculate averages
  const averages = {};
  for (const [key, total] of Object.entries(features)) {
    if (featureCounts[key] > 0) {
      averages[key] = total / featureCounts[key];
    }
  }
  
  return averages;
}

/**
 * Calculate spectral and advanced features from Essentia analysis
 */
function calculateSpectralFeatures(trackProfiles) {
  const spectralData = {
    spectralCentroid: [],
    spectralRolloff: [],
    zeroCrossingRate: [],
    mfcc: []
  };
  
  for (const track of trackProfiles) {
    if (track.essentiaFeatures) {
      // Extract spectral features if available
      const features = track.essentiaFeatures;
      
      if (features.spectral_centroid) spectralData.spectralCentroid.push(features.spectral_centroid);
      if (features.spectral_rolloff) spectralData.spectralRolloff.push(features.spectral_rolloff);
      if (features.zero_crossing_rate) spectralData.zeroCrossingRate.push(features.zero_crossing_rate);
      if (features.mfcc) spectralData.mfcc.push(features.mfcc);
    }
  }
  
  // Calculate averages for spectral features
  const spectralAverages = {};
  for (const [key, values] of Object.entries(spectralData)) {
    if (values.length > 0 && key !== 'mfcc') {
      spectralAverages[key] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
  }
  
  return spectralAverages;
}

// Run the builder
if (require.main === module) {
  buildEssentiaAudioProfileMatrix().catch(console.error);
}

module.exports = { buildEssentiaAudioProfileMatrix };
