import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRunLogger } from '../../utils/pipelineLogger.js';

let logged;

beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'log').mockImplementation((line) => logged.push(line));
});

afterEach(() => vi.restoreAllMocks());

describe('createRunLogger', () => {
  it('emits one parseable JSON line with event, outcome and duration', () => {
    const log = createRunLogger('deck_generate', { userId: 'user1' });
    log.finish('ok');

    expect(logged).toHaveLength(1);
    const line = JSON.parse(logged[0]);
    expect(line.event).toBe('deck_generate');
    expect(line.outcome).toBe('ok');
    expect(line.user_id).toBe('user1');
    expect(typeof line.duration_ms).toBe('number');
  });

  it('records marked stages and arbitrary facts', () => {
    const log = createRunLogger('deck_generate');
    log.set('model', 'test-model');
    log.mark('llm_initial');
    log.mark('fill_engine');
    log.finish('ok', { deck_size: 100 });

    const line = JSON.parse(logged[0]);
    expect(line.model).toBe('test-model');
    expect(line.deck_size).toBe(100);
    expect(Object.keys(line.stages)).toEqual(['llm_initial', 'fill_engine']);
    expect(line.stages.llm_initial).toBeGreaterThanOrEqual(0);
  });

  it('records failures with their error code', () => {
    const log = createRunLogger('deck_generate');
    log.finish('error', { error_code: 'COMMANDER_UNRESOLVED' });

    const line = JSON.parse(logged[0]);
    expect(line.outcome).toBe('error');
    expect(line.error_code).toBe('COMMANDER_UNRESOLVED');
  });

  it('defaults user_id to null when not supplied', () => {
    createRunLogger('deck_generate').finish('ok');
    expect(JSON.parse(logged[0]).user_id).toBeNull();
  });
});
