const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Event name is required"],
        trim: true,
    },
    date: {
        type: Date,
        required: [true, "Event date is required"],
    },
    location: {
        type: {
            type: String,
            enum: ["Point"],
            required: true,
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true,
        },
    },
    venue: {
        name: String,
        address: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
    },
    image: {
        type: String, // URL to the event image
    },
    url: {
        type: String, // URL to the event page (e.g., Ticketmaster link)
    },
    source: {
        type: String,
        required: true, // e.g., "Ticketmaster", "EDMTrain"
        index: true,
    },
    sourceId: {
        type: String,
        required: true, // The unique ID from the source system
        index: true,
    },
    priceRange: {
        min: Number,
        max: Number,
        currency: String,
    },
    // Use type: Object to allow arbitrary nested object structure
    characteristics: {
        type: Object,
        // Example structure expected: { genre: [String], subGenre: [String], type: String }
        // No strict sub-schema enforced here, allowing flexibility but requiring careful data handling
    },
    artists: [
        {
            name: String,
            id: String, // Source system ID for the artist, if available
        },
    ],
    promoter: {
        name: String,
        id: String, // Source system ID for the promoter, if available
    },
    lastUpdatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Create a compound index for source and sourceId for efficient upserts
eventSchema.index({ source: 1, sourceId: 1 }, { unique: true });

// Create a 2dsphere index on the location field for geospatial queries
eventSchema.index({ location: "2dsphere" });

// Update lastUpdatedAt timestamp before saving
eventSchema.pre("save", function (next) {
    this.lastUpdatedAt = new Date();
    next();
});

// Mongoose 6+ uses updateOne context slightly differently for hooks
// Using schema options for timestamps might be cleaner, but this works for bulkWrite
eventSchema.pre("updateOne", function (next) {
    this.set({ lastUpdatedAt: new Date() });
    next();
});


module.exports = mongoose.model("Event", eventSchema);

