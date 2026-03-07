import { describe, test, expect } from 'vitest'

const API_URL = process.env.API_URL || 'http://localhost:3001';

describe('Smoke Tests', () => {
  test('GET /api/health returns 200', async () => {
    const res = await fetch(`${API_URL}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('status');
  });

  test('GET /api/status returns initialized state', async () => {
    const res = await fetch(`${API_URL}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('initialized');
  });
});
