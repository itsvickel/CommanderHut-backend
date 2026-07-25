import Card from '../../models/Card.js';

const LAND_TYPE_RE = /\bLand\b/;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const BASIC_LAND_TYPE_RE = /Basic\s+Land/;

function commanderLegal() {
  return { 'legalities.commander': 'legal' };
}

function identityFilter(identity) {
  // Enforce both fields: color_identity is the true identity (synced from
  // Scryfall); a missing color_identity passes its $not clause, in which
  // case the colors clause still applies as a fallback for stale docs.
  return {
    color_identity: { $not: { $elemMatch: { $nin: identity } } },
    colors: { $not: { $elemMatch: { $nin: identity } } },
  };
}

function notInExcluded(excludeIds) {
  return excludeIds.length ? { _id: { $nin: excludeIds } } : {};
}

function priceUnder(maxPrice) {
  if (maxPrice == null || maxPrice === Infinity) return {};
  return { $or: [{ 'prices.usd': { $lte: maxPrice } }, { 'prices.usd': null }] };
}

export const cardRepo = {
  async findByExactName(name) {
    return Card.findOne({ name }).lean();
  },

  async findByNames(names) {
    if (!names.length) return [];
    return Card.find({ name: { $in: names } }).lean();
  },

  async findLegendaryCreatures({ commanderNameContains }) {
    return Card.find({
      type_line: { $regex: /Legendary Creature/ },
      ...commanderLegal(),
      ...(commanderNameContains
        ? { name: { $regex: escapeRegex(commanderNameContains), $options: 'i' } }
        : {}),
    }).limit(50).lean();
  },

  async findByRole({ role, colorIdentity, excludeIds, maxPrice, limit = 50 }) {
    const roleFilter = roleQuery(role);
    return Card.find({
      ...commanderLegal(),
      ...identityFilter(colorIdentity),
      ...notInExcluded(excludeIds),
      ...priceUnder(maxPrice),
      ...roleFilter,
      type_line: { $not: LAND_TYPE_RE },
    }).sort({ 'prices.usd': 1 }).limit(limit).lean();
  },

  async findNonBasicLands({ colorIdentity, excludeIds, maxPrice, limit = 50 }) {
    return Card.find({
      ...commanderLegal(),
      ...identityFilter(colorIdentity),
      ...notInExcluded(excludeIds),
      ...priceUnder(maxPrice),
      $and: [
        { type_line: { $regex: LAND_TYPE_RE } },
        { type_line: { $not: BASIC_LAND_TYPE_RE } },
      ],
    }).sort({ 'prices.usd': 1 }).limit(limit).lean();
  },

  async findBasicLandByColor(colorLetter) {
    const basicMap = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
    const name = basicMap[colorLetter];
    if (!name) return null;
    return Card.findOne({ name, type_line: { $regex: BASIC_LAND_TYPE_RE } }).lean();
  },

  async findWastes() {
    return Card.findOne({ name: 'Wastes' }).lean();
  },
};

function roleQuery(role) {
  switch (role) {
    case 'ramp':
      return { oracle_text: { $regex: /add \{|Search your library.*land/i } };
    case 'draw':
      return { oracle_text: { $regex: /draw (a|two|three|\d+) card/i } };
    case 'removal':
      return { oracle_text: { $regex: /destroy|exile target/i } };
    case 'interaction':
      return { oracle_text: { $regex: /counter target|prevent|return target/i } };
    case 'synergy':
    case 'win_con':
    case 'utility':
    default:
      return {};
  }
}
