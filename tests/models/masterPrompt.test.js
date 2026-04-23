import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';

// We test the schema shape without a real DB connection
describe('MasterPrompt schema', () => {
  it('should be importable and have the expected paths', async () => {
    const { default: MasterPrompt } = await import('../../models/MasterPrompt.js');
    const paths = MasterPrompt.schema.paths;
    expect(paths).toHaveProperty('role_description');
    expect(paths).toHaveProperty('domain_restrictions');
    expect(paths).toHaveProperty('additional_rules');
    expect(paths).toHaveProperty('updated_by');
    expect(paths).toHaveProperty('created_at');
    expect(paths).toHaveProperty('updated_at');
  });
});
