import axios from 'axios';
import mongoose from 'mongoose';
import Card from '../models/Card.js';
import connectDB from '../config/db.js'; // Your MongoDB connection function

async function populateDatabase() {
  try {
    // Wait for DB connection
    await connectDB();
    console.log("✅ Connected to MongoDB");

    // Clear existing cards
    await Card.deleteMany({});
    console.log("✅ Cleared existing cards");

    // Fetch bulk data info from Scryfall
    const bulkDataUrl = "https://api.scryfall.com/bulk-data";
    const res = await axios.get(bulkDataUrl);
    const bulkData = res.data.data.find(d => d.type === "default_cards");

    if (!bulkData) {
      console.error("❌ Could not find default_cards data.");
      return;
    }

    // Download full card JSON file
    console.log("⬇️ Downloading full card JSON...");
    const cardRes = await axios.get(bulkData.download_uri);
    const cards = cardRes.data;
    console.log(`📦 Total cards found: ${cards.length}`);

    const batchSize = 1000;
    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize).map(card => ({
        name: card.name,
        mana_cost: card.mana_cost || null,
        type_line: card.type_line || null,
        oracle_text: card.oracle_text || null,
        colors: card.colors || [],
        set: card.set || null,
        set_name: card.set_name || null,
        collector_number: card.collector_number || "0",
        artist: card.artist || "Unknown Artist",
        released_at: card.released_at || null,
        image_uris: card.image_uris || null,
        legalities: card.legalities || null,
        layout: card.layout || null,
      }));

      await Card.insertMany(batch, { ordered: false });
      console.log(`✅ Inserted cards ${i + 1} to ${Math.min(i + batchSize, cards.length)}`);
    }

    console.log("🎉 Done populating all MTG cards!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error populating DB:", err);
    process.exit(1);
  }
}

populateDatabase();
