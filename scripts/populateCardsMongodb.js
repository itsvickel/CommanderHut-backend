import 'dotenv/config';
import { createRequire } from 'module';
import axios from 'axios';
import mongoose from 'mongoose';
import Card from '../models/Card.js';
import connectDB from '../config/db.js';

const require = createRequire(import.meta.url);
const { withParserAsStream } = require('stream-json/streamers/stream-array.js');

const BULK_INDEX_URL = 'https://api.scryfall.com/bulk-data';
const BATCH_SIZE = 1000;

function toCardDoc(card) {
  const parsePrice = v => (v == null ? null : parseFloat(v));
  return {
    scryfallId: card.id,
    name: card.name,
    mana_cost: card.mana_cost || null,
    type_line: card.type_line || null,
    oracle_text: card.oracle_text || null,
    colors: card.colors || [],
    color_identity: card.color_identity || [],
    edhrec_rank: card.edhrec_rank ?? null,
    game_changer: card.game_changer === true,
    set: card.set || null,
    set_name: card.set_name || null,
    collector_number: card.collector_number || '0',
    artist: card.artist || 'Unknown Artist',
    released_at: card.released_at || null,
    image_uris: card.image_uris || null,
    legalities: card.legalities || null,
    layout: card.layout || null,
    cmc: card.cmc ?? null,
    prices: {
      usd: parsePrice(card.prices?.usd),
      usd_foil: parsePrice(card.prices?.usd_foil),
    },
  };
}

async function sync() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  const startedAt = Date.now();
  await connectDB();
  console.log('Connected to MongoDB');

  const index = await axios.get(BULK_INDEX_URL);
  const bulk = index.data.data.find(d => d.type === 'default_cards');
  if (!bulk) throw new Error('default_cards entry not found in Scryfall bulk index');

  console.log(`Scryfall bulk updated_at: ${bulk.updated_at}`);
  console.log(`Downloading ${bulk.download_uri} ...`);

  const cardRes = await axios.get(bulk.download_uri, { responseType: 'stream' });
  const pipeline = withParserAsStream();
  cardRes.data.pipe(pipeline);

  let batch = [];
  let upserted = 0;
  let modified = 0;
  let processed = 0;

  for await (const { value: card } of pipeline) {
    batch.push(card);
    if (batch.length >= BATCH_SIZE) {
      const ops = batch.map(c => ({
        updateOne: {
          filter: { scryfallId: c.id },
          update: { $set: toCardDoc(c) },
          upsert: true,
        },
      }));
      const res = await Card.bulkWrite(ops, { ordered: false });
      upserted += res.upsertedCount || 0;
      modified += res.modifiedCount || 0;
      processed += batch.length;
      batch = [];
      console.log(`Processed ${processed} cards...`);
    }
  }

  if (batch.length > 0) {
    const ops = batch.map(c => ({
      updateOne: {
        filter: { scryfallId: c.id },
        update: { $set: toCardDoc(c) },
        upsert: true,
      },
    }));
    const res = await Card.bulkWrite(ops, { ordered: false });
    upserted += res.upsertedCount || 0;
    modified += res.modifiedCount || 0;
    processed += batch.length;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done. inserted=${upserted} updated=${modified} total=${processed} elapsed=${elapsed}s`);
}

sync()
  .catch(err => {
    console.error('Card sync failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
