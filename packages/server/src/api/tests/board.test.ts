import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createExpressApp } from '../src/create-server'
import fs from 'node:fs'
import path from 'node:path'

const TEST_ROOT = '/tmp/tycono-board-api-test'

describe('Board API', () => {
  beforeAll(() => {
    process.env.COMPANY_ROOT = TEST_ROOT
    fs.mkdirSync(path.join(TEST_ROOT, '.tycono', 'boards'), { recursive: true })
  })

  afterAll(() => {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
  })

  const app = createExpressApp()
  const waveId = 'wave-board-test'

  test('GET /api/waves/:waveId/board — 404 when no board', async () => {
    const res = await request(app).get(`/api/waves/${waveId}/board`)
    expect(res.status).toBe(404)
  })

  test('POST /api/waves/:waveId/board — create board', async () => {
    const res = await request(app)
      .post(`/api/waves/${waveId}/board`)
      .send({
        directive: '타워디펜스 만들어',
        tasks: [
          { id: 't1', title: '시장 분석', assignee: 'cbo', status: 'waiting', dependsOn: [] },
          { id: 't2', title: '아키텍처', assignee: 'cto', status: 'waiting', dependsOn: ['t1'] },
          { id: 't3', title: '구현', assignee: 'engineer', status: 'waiting', dependsOn: ['t2'] },
        ],
      })
    expect(res.status).toBe(201)
    expect(res.body.waveId).toBe(waveId)
    expect(res.body.tasks).toHaveLength(3)
  })

  test('POST /api/waves/:waveId/board — 409 duplicate', async () => {
    const res = await request(app)
      .post(`/api/waves/${waveId}/board`)
      .send({ directive: 'dup', tasks: [{ id: 'x', title: 'x', assignee: 'x', status: 'waiting', dependsOn: [] }] })
    expect(res.status).toBe(409)
  })

  test('GET /api/waves/:waveId/board — get board', async () => {
    const res = await request(app).get(`/api/waves/${waveId}/board`)
    expect(res.status).toBe(200)
    expect(res.body.directive).toBe('타워디펜스 만들어')
    expect(res.body.tasks).toHaveLength(3)
  })

  test('PATCH — claim task (waiting → running)', async () => {
    const res = await request(app)
      .patch(`/api/waves/${waveId}/board/tasks/t1`)
      .send({ status: 'running' })
    expect(res.status).toBe(200)
    expect(res.body.tasks[0].status).toBe('running')
    expect(res.body.tasks[0].startedAt).toBeTruthy()
  })

  test('PATCH — invalid transition (running → waiting)', async () => {
    const res = await request(app)
      .patch(`/api/waves/${waveId}/board/tasks/t1`)
      .send({ status: 'waiting' })
    expect(res.status).toBe(400)
  })

  test('POST — complete task', async () => {
    const res = await request(app)
      .post(`/api/waves/${waveId}/board/tasks/t1/complete`)
      .send({ result: 'pass', note: '경쟁사 5개 분석' })
    expect(res.status).toBe(200)
    expect(res.body.tasks[0].status).toBe('done')
    expect(res.body.tasks[0].result).toBe('pass')
    expect(res.body.history).toHaveLength(1)
  })

  test('PATCH — update task content', async () => {
    const res = await request(app)
      .patch(`/api/waves/${waveId}/board/tasks/t2`)
      .send({ title: '아키텍처 (Vue 기반)', criteria: 'Vue + Vite' })
    expect(res.status).toBe(200)
    expect(res.body.tasks[1].title).toBe('아키텍처 (Vue 기반)')
    expect(res.body.tasks[1].criteria).toBe('Vue + Vite')
  })

  test('PATCH — skip task', async () => {
    const res = await request(app)
      .patch(`/api/waves/${waveId}/board/tasks/t2`)
      .send({ status: 'skipped' })
    expect(res.status).toBe(200)
    expect(res.body.tasks[1].status).toBe('skipped')
  })

  test('POST — add task', async () => {
    const res = await request(app)
      .post(`/api/waves/${waveId}/board/tasks`)
      .send({ id: 't4', title: 'QA 테스트', assignee: 'qa', dependsOn: ['t3'] })
    expect(res.status).toBe(201)
    expect(res.body.tasks).toHaveLength(4)
  })

  test('POST — add duplicate task', async () => {
    const res = await request(app)
      .post(`/api/waves/${waveId}/board/tasks`)
      .send({ id: 't4', title: 'dup', assignee: 'qa', dependsOn: [] })
    expect(res.status).toBe(400)
  })

  test('board.json persisted to disk', () => {
    const filePath = path.join(TEST_ROOT, '.tycono', 'boards', `${waveId}.json`)
    expect(fs.existsSync(filePath)).toBe(true)
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(data.tasks).toHaveLength(4)
    expect(data.history).toHaveLength(1)
  })
})
