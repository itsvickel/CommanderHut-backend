import GenerationPreview from '../../models/GenerationPreview.js';
import { createPreviewCache } from './previewCache.js';

/**
 * Two-tier preview storage: an in-process LRU for speed, backed by Mongo so
 * previews survive restarts and work across instances. Mongo failures are
 * logged and degrade to memory-only rather than failing a generation.
 */

const memory = createPreviewCache({ capacity: 500, ttlMs: 60 * 60 * 1000 });

export async function setPreview(id, payload) {
  memory.set(id, payload);
  try {
    await GenerationPreview.findByIdAndUpdate(
      id,
      { user_id: String(payload.user_id), payload, createdAt: new Date() },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[previewStore] persist failed, memory only:', err.message);
  }
}

export async function getPreview(id) {
  const hit = memory.get(id);
  if (hit) return hit;
  try {
    const doc = await GenerationPreview.findById(id).lean();
    if (!doc) return null;
    memory.set(id, doc.payload);
    return doc.payload;
  } catch (err) {
    console.warn('[previewStore] lookup failed:', err.message);
    return null;
  }
}

export async function deletePreview(id) {
  memory.delete(id);
  try {
    await GenerationPreview.findByIdAndDelete(id);
  } catch (err) {
    console.warn('[previewStore] delete failed:', err.message);
  }
}
