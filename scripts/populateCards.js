const axios = require("axios");
const Card = require("../models/Card");
const sequelize = require("../config/db");

async function populateDatabase() {
  try {
    // Recreate the table (drop and re-create)
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    console.log("✅ Connected to DB and recreated the Cards table.");

    // Fetch bulk data info from Scryfall
    const bulkDataUrl = "https://api.scryfall.com/bulk-data";
    const res = await axios.get(bulkDataUrl);
    const bulkData = res.data.data.find(d => d.type === "default_cards");

    if (!bulkData) {
      console.error("❌ Could not find default_cards data.");
      return;
    }

    // Download the full card JSON file
    console.log("⬇️ Downloading full card JSON...");
    const cardRes = await axios.get(bulkData.download_uri);
    const cards = cardRes.data;
    console.log(`📦 Total cards found: ${cards.length}`);

    const batchSize = 1000;
    let batch = [];

    // Process each card and batch them
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];

      batch.push({
        name: card.name,
        mana_cost: card.mana_cost || null,
        type_line: card.type_line || null,
        oracle_text: card.oracle_text || null,
        colors: JSON.stringify(card.colors || []),  
        set: card.set || null,
        set_name: card.set_name || null,
        collector_number: card.collector_number || "0",
        artist: card.artist || "Unknown Artist",
        released_at: card.released_at || null,
        image_uris: card.image_uris || null,  
        legalities: card.legalities || null,
        layout: card.layout || null,
      });
      

      // When batch size is reached, insert the batch and clear it
      if (batch.length >= batchSize) {
        await Card.bulkCreate(batch, { ignoreDuplicates: true });
        console.log(`✅ Inserted ${i + 1} / ${cards.length} cards...`);
        batch = []; // Clear batch for next iteration
      }
    }

    // Insert any remaining cards in the batch
    if (batch.length > 0) {
      await Card.bulkCreate(batch, { ignoreDuplicates: true });
      console.log(`✅ Inserted final ${batch.length} cards.`);
    }

    console.log("🎉 Done populating all MTG cards!");
    process.exit();
  } catch (err) {
    console.error("❌ Error populating DB:", err);
    process.exit(1);
  }
}

populateDatabase();
