// models/Event.js
const mongoose = require("mongoose");

// Define the main Event schema with enhanced fields
const EventSchema = new mongoose.Schema({
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
  
  // Classification & Categorization
  genres: [{ 
    type: String 
  }], // Flattened array of all genres for easy filtering
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
  
  // Artists & Performers
  artists: [{
    name: { type: String },
    id: { type: String },
    url: { type: String },
    image: { type: String },
    genres: [{ type: String }],
    popularity: { type: Number },
    headliner: { type: Boolean }
  }],
  artistList: [{ 
    type: String 
  }], // Flattened array of artist names for frontend
  
  // Promoter & Organizer
  promoter: {
    id: { type: String },
    name: { type: String },
    description: { type: String }
  },
  
  // External Links & References
  url: {
    type: String, // Ticketmaster event URL
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
  
  // Sound Characteristics (for matching with user profiles)
  characteristics: {
    melody: { type: Number }, // 0-100 scale
    danceability: { type: Number }, // 0-100 scale
    energy: { type: Number }, // 0-100 scale
    tempo: { type: Number }, // 0-100 scale
    obscurity: { type: Number }, // 0-100 scale
    acousticness: { type: Number },
    instrumentalness: { type: Number },
    liveness: { type: Number },
    valence: { type: Number } // Musical positiveness
  },
  
  // Source Tracking
  source: { 
    type: String, 
    required: true, 
    default: "Ticketmaster",
    index: true
  },
  sourceId: { 
    type: String, 
    required: true,
    index: true
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
  }
});

// Create a 2dsphere index on the location field for geospatial queries
EventSchema.index({ location: "2dsphere" });

// Create a compound index for source and sourceId for efficient upserts
EventSchema.index({ source: 1, sourceId: 1 }, { unique: true });

// Create additional indexes for common queries
EventSchema.index({ date: 1 });
EventSchema.index({ "venue.city": 1 });
EventSchema.index({ genres: 1 });

// Middleware to update the `updatedAt` field on save
EventSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Mongoose 6+ uses updateOne context slightly differently for hooks
EventSchema.pre("updateOne", function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model("Event", EventSchema);
