import { describe, test, expect } from 'vitest'
import request from 'supertest'
import { createExpressApp } from '../src/create-server'

describe('Smoke Tests', () => {
  const app = createExpressApp()

  test('server starts', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
  })

  test('API routes are registered', async () => {
    const res = await request(app).get('/api/status')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('companyRoot')
  })
})
