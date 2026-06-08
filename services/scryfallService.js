import axios from 'axios';

const BASE = 'https://api.scryfall.com';

export async function lookupCard(name) {
  try {
    const { data } = await axios.get(`${BASE}/cards/named`, { params: { fuzzy: name } });
    return data;
  } catch (err) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function lookupCardBatch(names) {
  if (!names.length) return { found: [], notFound: [] };
  const { data } = await axios.post(`${BASE}/cards/collection`, {
    identifiers: names.map(name => ({ name })),
  });
  const notFound = (data.not_found ?? []).map(id => id.name);
  return { found: data.data, notFound };
}
