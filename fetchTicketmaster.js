// Remove dotenv for Heroku deployment
// require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const Event = require("./models/Event");

// Environment variables with better error handling
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

console.log("🔍 Environment check:");
console.log("TICKETMASTER_API_KEY:", TICKETMASTER_API_KEY ? "✅ Set" : "❌ Missing");
console.log("MONGODB_URI:", MONGODB_URI ? "✅ Set" : "❌ Missing");

if (!MONGODB_URI) {
    console.error("❌ Error: MONGODB_URI environment variable is not set");
    console.log("Available env vars:", Object.keys(process.env).filter(key => key.includes('MONGO')));
    process.exit(1);
}

if (!TICKETMASTER_API_KEY) {
    console.error("❌ Error: TICKETMASTER_API_KEY environment variable is not set");
    process.exit(1);
}

const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

// List of major Canadian cities to query
const CANADIAN_CITIES = [
    "Toronto",
    "Montreal", 
    "Vancouver",
    "Calgary",
    "Edmonton",
    "Ottawa",
    "Winnipeg",
    "Quebec City",
    "Hamilton",
    "Mississauga"
];

// Database Connection
async function connectDB() {
    try {
        console.log("🔗 Connecting to MongoDB...");
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB Connected successfully");
    } catch (err) {
        console.error("❌ MongoDB connection error:", err.message);
        process.exit(1);
    }
}

async function disconnectDB() {
    try {
        await mongoose.disconnect();
        console.log("✅ MongoDB Disconnected");
    } catch (err) {
        console.error("❌ Error disconnecting MongoDB:", err.message);
    }
}

// [Rest of the fetchTicketmaster.js code remains the same...]
// [Include all the transformation logic, fetching logic, etc. from the original file]

