const mongoose = require("mongoose");

// UnifiedEvent Schema - Unified collection for processed events from all sources
// This is the final collection that the frontend consumes
// All events from different sources are processed, normalized, and stored here

const UnifiedEventSchema = new mongoose.Schema({
  // Basic Event Information
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'postponed', 'rescheduled'],
    default: 'active'
  },
  
  // Temporal Information
  date: {
    type: Date,
    required: true,
  },
  startTime: {
    type: String,
  },
  endTime: {
    type: String,
  },
  doorTime: {
    type: String,
  },
  
  // Location Information
  venue: {
    name: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    postalCode: { type: String },
    type: { type: String },
    capacity: { type: Number },
    url: { type: String }
  },
  location: {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  
  // Visual Assets
  images: [{
    url: { type: String },
    ratio: { type: String },
    width: { type: Number },
    height: { type: Number },
    fallback: { type: Boolean }
  }],
  primaryImage: { 
    type: String // URL to primary image for quick access
  },
  image: {
    type: String, // Legacy field for backward compatibility
  },
  
  // Pricing Information
  priceRange: {
    min: { type: Number },
    max: { type: Number },
    currency: { type: String }
  },
  price: { 
    type: String // Formatted price string for frontend display
  },
  ticketLimit: { 
    type: String 
  },
  
  // Enhanced Classification & Categorization
  genres: [{ 
    type: String 
  }], // Flattened array of all genres for easy filtering
  
  // Enhanced genre representation for ML matching
  genreVector: {
    // Primary genres with confidence scores (0-100)
    primary: {
      type: Map,
      of: Number
    },
    // Secondary genres with confidence scores (0-100)
    secondary: {
      type: Map,
      of: Number
    },
    // Genre diversity index (0-100, higher means more diverse)
    diversityIndex: {
      type: Number
    }
  },
  
  classifications: [{
    primary: { type: Boolean },
    segment: {
      id: { type: String },
      name: { type: String }
    },
    genre: {
      id: { type: String },
      name: { type: String }
    },
    subGenre: {
      id: { type: String },
      name: { type: String }
    },
    type: {
      id: { type: String },
      name: { type: String }
    },
    subType: {
      id: { type: String },
      name: { type: String }
    }
  }],
  
  // Enhanced Artists & Performers
  artists: [{
    name: { type: String },
    id: { type: String },
    url: { type: String },
    image: { type: String },
    genres: [{ type: String }],
    popularity: { type: Number },
    headliner: { type: Boolean },
    // New fields for ML matching
    spotifyId: { type: String },
    monthlyListeners: { type: Number },
    followerCount: { type: Number }
  }],
  artistList: [{ 
    type: String 
  }], // Flattened array of artist names for frontend
  
  // Enhanced Sound Characteristics (for matching with user profiles)
  characteristics: {
    // Core characteristics (0-100 scale)
    melody: { type: Number },
    danceability: { type: Number },
    energy: { type: Number },
    tempo: { type: Number },
    obscurity: { type: Number },
    
    // Additional characteristics (0-100 scale)
    acousticness: { type: Number },
    instrumentalness: { type: Number },
    liveness: { type: Number },
    valence: { type: Number },
    
    // Sound DNA (dimensionality-reduced representation)
    soundDNA: [{ type: Number }],
    
    // Confidence score for characteristics (0-100)
    confidenceScore: { type: Number },
    
    // Source of characteristics (artist-derived, genre-derived, or direct)
    characteristicsSource: { 
      type: String,
      enum: ['artist', 'genre', 'direct'],
      default: 'genre'
    }
  },
  
  // Contextual Factors (for contextual matching)
  contextualFactors: {
    // Seasonal positioning (0-100 scores)
    seasonal: {
      spring: { type: Number },
      summer: { type: Number },
      fall: { type: Number },
      winter: { type: Number }
    },
    
    // Time factors
    timeOfDay: { 
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'night']
    },
    dayOfWeek: { 
      type: Number // 0-6, Sunday-Saturday
    },
    weekend: { 
      type: Boolean
    },
    
    // Venue factors
    indoorOutdoor: { 
      type: String,
      enum: ['indoor', 'outdoor', 'mixed', 'unknown'],
      default: 'unknown'
    },
    venueSize: { 
      type: String,
      enum: ['intimate', 'small', 'medium', 'large', 'festival', 'unknown'],
      default: 'unknown'
    },
    
    // Event type factors
    isFestival: { 
      type: Boolean,
      default: false
    },
    isRecurring: { 
      type: Boolean,
      default: false
    }
  },
  
  // Recommendation Metrics
  recommendationMetrics: {
    // Popularity score (0-100)
    popularityScore: { type: Number },
    
    // Trending score (0-100, higher means more trending)
    trendingScore: { type: Number },
    
    // Uniqueness score (0-100, higher means more unique)
    uniquenessScore: { type: Number },
    
    // User interaction metrics
    clickCount: { type: Number, default: 0 },
    saveCount: { type: Number, default: 0 },
    attendCount: { type: Number, default: 0 },
    averageRating: { type: Number },
    
    // SURGICAL ADDITION: Enhanced recommendation fields
    tasteScore: { type: Number, min: 0, max: 100, default: 0 },
    scoreBreakdown: {
      genre: { score: Number, details: String },
      artist: { score: Number, details: String },
      venue: { score: Number, details: String }
    },
    confidence: { type: Number, min: 0, max: 100, default: 0 },
    calculatedAt: { type: Date },
    version: { type: String, default: "1.0" }
  },
  
  // Promoter & Organizer
  promoter: {
    id: { type: String },
    name: { type: String },
    description: { type: String }
  },
  
  // External Links & References
  url: {
    type: String, // Event URL
  },
  seatmap: { 
    type: String // URL to seatmap image
  },
  pleaseNote: { 
    type: String // Special notes about the event
  },
  
  // Accessibility Information
  accessibility: {
    info: { type: String },
    ticketLimit: { type: Number }
  },
  
  // Sales Information
  sales: {
    public: {
      startDateTime: { type: Date },
      endDateTime: { type: Date },
      startTBD: { type: Boolean }
    },
    presales: [{
      name: { type: String },
      description: { type: String },
      startDateTime: { type: Date },
      endDateTime: { type: Date },
      url: { type: String }
    }]
  },
  
  // Source Tracking - Can be from any source after processing
  source: { 
    type: String, 
    required: true,
    index: true
  },
  sourceId: { 
    type: String, 
    required: true,
    index: true
  },
  id: {
    type: String,
    required: true,
    index: true
  },
  
  // Unified Processing Metadata
  unifiedProcessing: {
    // When this event was processed into the unified collection
    processedAt: {
      type: Date,
      default: Date.now
    },
    // Version of the processing pipeline used
    processingVersion: {
      type: String,
      default: '1.0.0'
    },
    // Quality score assigned during processing (0-100)
    qualityScore: {
      type: Number,
      min: 0,
      max: 100
    },
    // Whether this event was deduplicated
    isDeduplicated: {
      type: Boolean,
      default: false
    },
    // If deduplicated, references to original source events
    sourceEvents: [{
      source: { type: String },
      sourceId: { type: String },
      collection: { type: String }
    }]
  },
  
  // SURGICAL ADDITION: OCR Enhancement Fields
  ocrProcessed: {
    type: Boolean,
    default: false,
    index: true
  },
  
  ocrSkipped: {
    type: Boolean,
    default: false
  },
  
  ocrResults: {
    artists: [{ type: String }],
    confidence: { 
      type: Number, 
      min: 0, 
      max: 1 
    },
    processingTime: { 
      type: Number 
    },
    imageUrl: { 
      type: String 
    },
    processedAt: { 
      type: Date, 
      default: Date.now 
    }
  },
  
  ocrError: {
    type: String
  },
  
  ocrAttemptedAt: {
    type: Date
  },
  
  ocrReason: {
    type: String
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  lastFetchedAt: {
    type: Date,
    default: Date.now
  },

  // SURGICAL ADDITION: Recommendation Enhancement Fields
  artistExtraction: {
    method: { type: String, enum: ["enhanced", "ticketmaster", "name_parsing", "none"], default: "none" },
    confidence: { type: Number, min: 0, max: 100, default: 0 },
    extractedAt: { type: Date }
  },
  primaryGenre: { type: String, default: "unknown" },
  isEdmEvent: { type: Boolean, default: false },
  edmConfidence: { type: Number, min: 0, max: 100, default: 0 },
  genreDetection: {
    method: { type: String, enum: ["enhanced", "ticketmaster", "artist_based", "none"], default: "none" },
    confidence: { type: Number, min: 0, max: 100, default: 0 },
    detectedAt: { type: Date }
  },
  enhancementProcessed: { type: Boolean, default: false },
  enhancementMetadata: {
    processedAt: { type: Date },
    version: { type: String },
    stages: [{ type: String }]
  },
  enhancementSkipped: { type: Boolean, default: false }
});

// Create a 2dsphere index on the location field for geospatial queries
UnifiedEventSchema.index({ location: "2dsphere" });

// Create a compound index for source and sourceId for efficient lookups
UnifiedEventSchema.index({ source: 1, sourceId: 1 });

// Create additional indexes for common queries
UnifiedEventSchema.index({ date: 1 });
UnifiedEventSchema.index({ "venue.city": 1 });
UnifiedEventSchema.index({ genres: 1 });
UnifiedEventSchema.index({ "artists.name": 1 });
UnifiedEventSchema.index({ "genreVector.primary": 1 });
UnifiedEventSchema.index({ "characteristics.energy": 1, "characteristics.danceability": 1 });

// SURGICAL ADDITION: OCR processing indexes
UnifiedEventSchema.index({ ocrProcessed: 1 });
UnifiedEventSchema.index({ ocrSkipped: 1 });
UnifiedEventSchema.index({ ocrProcessed: 1, ocrSkipped: 1 });
UnifiedEventSchema.index({ "recommendationMetrics.popularityScore": 1 });

// Unified processing specific indexes
UnifiedEventSchema.index({ "unifiedProcessing.processedAt": 1 });
UnifiedEventSchema.index({ "unifiedProcessing.qualityScore": 1 });

// Middleware to update the `updatedAt` field on save
UnifiedEventSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Export with explicit collection name for the unified collection
module.exports = mongoose.model("UnifiedEvent", UnifiedEventSchema, "events_unified");

