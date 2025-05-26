const axios = require("axios");
const Card = require("../models/Card");
const sequelize = require("../models");
require("dotenv").config();

async function updateCards() {
    await sequelize.sync(); // Creates tables if not exist

    const metaRes = await axios.get("https://api.scryfall.com/bulk-data/default-cards");
    const dataUrl = metaRes.data.download_uri;
    const cardsRes = await axios.get(dataUrl);

    const cards = cardsRes.data;

    for (const card of cards) {
        await Card.upsert({
            id: card.id,
            name: card.name,
            mana_cost: card.mana_cost,
            type_line: card.type_line,
            oracle_text: card.oracle_text,
            set_name: card.set_name,
            image_uris: card.image_uris || null,
        });
    }

    console.log(`✅ Updated ${cards.length} cards`);
}

module.exports = updateCards;
