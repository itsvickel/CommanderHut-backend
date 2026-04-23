import { describe, it, expect } from 'vitest';
import { parseQ, buildFilter } from '../../../services/cardSearch/queryBuilder.js';

describe('parseQ', () => {
  it('returns empty object for empty string', () => {
    expect(parseQ('')).toEqual({});
  });

  it('treats bare text as name', () => {
    expect(parseQ('sol ring')).toEqual({ name: 'sol ring' });
  });

  it('extracts text: keyword', () => {
    expect(parseQ('text:"draw a card"')).toEqual({ text: 'draw a card' });
  });

  it('extracts type: keyword', () => {
    expect(parseQ('type:"creature"')).toEqual({ type: 'creature' });
  });

  it('extracts name: keyword explicitly', () => {
    expect(parseQ('name:"atraxa"')).toEqual({ name: 'atraxa' });
  });

  it('extracts multiple keywords and bare text', () => {
    expect(parseQ('sol ring text:"add mana" type:"artifact"')).toEqual({
      name: 'sol ring',
      text: 'add mana',
      type: 'artifact',
    });
  });

  it('returns empty object for whitespace-only string', () => {
    expect(parseQ('   ')).toEqual({});
  });
});

describe('buildFilter', () => {
  it('returns {} when no params given', () => {
    expect(buildFilter({})).toEqual({});
  });

  it('builds name regex filter', () => {
    const f = buildFilter({ name: 'sol ring' });
    expect(f).toEqual({ $and: [{ name: { $regex: 'sol ring', $options: 'i' } }] });
  });

  it('escapes regex special chars in name', () => {
    const f = buildFilter({ name: 'sol+ring' });
    expect(f.$and[0].name.$regex).toBe('sol\\+ring');
  });

  it('builds oracle_text filter for text param', () => {
    const f = buildFilter({ text: 'draw a card' });
    expect(f).toEqual({ $and: [{ oracle_text: { $regex: 'draw a card', $options: 'i' } }] });
  });

  it('builds type_line filter for type param', () => {
    const f = buildFilter({ type: 'creature' });
    expect(f).toEqual({ $and: [{ type_line: { $regex: 'creature', $options: 'i' } }] });
  });

  it('builds colors $all filter', () => {
    const f = buildFilter({ colors: ['W', 'U'] });
    expect(f).toEqual({ $and: [{ colors: { $all: ['W', 'U'] } }] });
  });

  it('builds color_identity $not $elemMatch filter', () => {
    const f = buildFilter({ color_identity: ['W', 'U', 'B'] });
    expect(f).toEqual({
      $and: [{ colors: { $not: { $elemMatch: { $nin: ['W', 'U', 'B'] } } } }],
    });
  });

  it('builds cmc_min only filter', () => {
    const f = buildFilter({ cmc_min: 2 });
    expect(f).toEqual({ $and: [{ cmc: { $gte: 2 } }] });
  });

  it('builds cmc_max only filter', () => {
    const f = buildFilter({ cmc_max: 4 });
    expect(f).toEqual({ $and: [{ cmc: { $lte: 4 } }] });
  });

  it('merges cmc_min and cmc_max into single clause', () => {
    const f = buildFilter({ cmc_min: 2, cmc_max: 4 });
    expect(f).toEqual({ $and: [{ cmc: { $gte: 2, $lte: 4 } }] });
  });

  it('builds price_max filter allowing null prices', () => {
    const f = buildFilter({ price_max: 5 });
    expect(f).toEqual({
      $and: [{ $or: [{ 'prices.usd': { $lte: 5 } }, { 'prices.usd': null }] }],
    });
  });

  it('builds legality filter', () => {
    const f = buildFilter({ legal: 'commander' });
    expect(f).toEqual({ $and: [{ 'legalities.commander': 'legal' }] });
  });

  it('ignores unknown legal format', () => {
    const f = buildFilter({ legal: 'not-a-format' });
    expect(f).toEqual({});
  });

  it('combines multiple clauses with $and', () => {
    const f = buildFilter({ name: 'lightning bolt', legal: 'commander' });
    expect(f.$and).toHaveLength(2);
  });
});
