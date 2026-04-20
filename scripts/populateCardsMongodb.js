import axios from 'axios';
import mongoose from 'mongoose';
import Card from '../models/Card.js';
import connectDB from '../config/db.js';

const BULK_INDEX_URL = 'https://api.scryfall.com/bulk-data';
const BATCH_SIZE = 1000;

function toCardDoc(card) {
  return {
    scryfallId: card.id,
    name: card.name,
    mana_cost: card.mana_cost || null,
    type_line: card.type_line || null,
    oracle_text: card.oracle_text || null,
    colors: card.colors || [],
    set: card.set || null,
    set_name: card.set_name || null,
    collector_number: card.collector_number || '0',
    artist: card.artist || 'Unknown Artist',
    released_at: card.released_at || null,
    image_uris: card.image_uris || null,
    legalities: card.legalities || null,
    layout: card.layout || null,
  };
}

async function sync() {
  const startedAt = Date.now();
  await connectDB();
  console.log('Connected to MongoDB');

  const index = await axios.get(BULK_INDEX_URL);
  const bulk = index.data.data.find(d => d.type === 'default_cards');
  if (!bulk) throw new Error('default_cards entry not found in Scryfall bulk index');

  console.log(`Scryfall bulk updated_at: ${bulk.updated_at}`);
  console.log(`Downloading ${bulk.download_uri} ...`);

  const cardRes = await axios.get(bulk.download_uri, { responseType: 'json' });
  const cards = cardRes.data;
  console.log(`Total cards in bulk: ${cards.length}`);

  let upserted = 0;
  let modified = 0;
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const slice = cards.slice(i, i + BATCH_SIZE);
    const ops = slice.map(card => ({
      updateOne: {
        filter: { scryfallId: card.id },
        update: { $set: toCardDoc(card) },
        upsert: true,
      },
    }));
    const res = await Card.bulkWrite(ops, { ordered: false });
    upserted += res.upsertedCount || 0;
    modified += res.modifiedCount || 0;
    console.log(`Processed ${Math.min(i + BATCH_SIZE, cards.length)} / ${cards.length}`);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done. inserted=${upserted} updated=${modified} elapsed=${elapsed}s`);
}

sync()
  .catch(err => {
    console.error('Card sync failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
