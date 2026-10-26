import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../api/firms/live'

interface MockResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
  setHeader: (k: string, v: string) => void
  end: (data: string) => void
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k: string, v: string) {
      res.headers[k.toLowerCase()] = v
    },
    end(data: string) {
      res.body = data
    },
  }
  return res
}

describe('14. Server-Side NASA FIRMS Proxy (api/firms/live)', () => {
  const originalEnv = process.env.NASA_FIRMS_MAP_KEY

  beforeEach(() => {
    delete process.env.NASA_FIRMS_MAP_KEY
  })

  afterEach(() => {
    if (originalEnv) {
      process.env.NASA_FIRMS_MAP_KEY = originalEnv
    } else {
      delete process.env.NASA_FIRMS_MAP_KEY
    }
    vi.restoreAllMocks()
  })

  it('returns 400 when no MAP_KEY is configured on the server and none provided in headers', async () => {
    const req = {
      url: '/api/firms/live?source=VIIRS_SNPP_NRT&days=3&area=68,8,97,37',
      headers: {},
    } as any

    const res = createMockResponse()
    await handler(req, res as any)

    expect(res.statusCode).toBe(400)
    const json = JSON.parse(res.body)
    expect(json.error).toContain('NASA FIRMS MAP_KEY is not configured on the server')
  })

  it('returns 400 for invalid MAP_KEY format', async () => {
    const req = {
      url: '/api/firms/live?source=VIIRS_SNPP_NRT&days=3&area=68,8,97,37',
      headers: {
        'x-firms-map-key': 'short',
      },
    } as any

    const res = createMockResponse()
    await handler(req, res as any)

    expect(res.statusCode).toBe(400)
    const json = JSON.parse(res.body)
    expect(json.error).toContain('Invalid MAP_KEY format')
  })

  it('validates satellite source and rejects unknown instruments', async () => {
    const req = {
      url: '/api/firms/live?source=INVALID_SENSOR&days=3&area=68,8,97,37',
      headers: {
        'x-firms-map-key': '1234567890abcdef1234567890abcdef',
      },
    } as any

    const res = createMockResponse()
    await handler(req, res as any)

    expect(res.statusCode).toBe(400)
    const json = JSON.parse(res.body)
    expect(json.error).toContain('Invalid satellite source')
  })

  it('validates days parameter range (must be between 1 and 5)', async () => {
    const req = {
      url: '/api/firms/live?source=VIIRS_SNPP_NRT&days=99&area=68,8,97,37',
      headers: {
        'x-firms-map-key': '1234567890abcdef1234567890abcdef',
      },
    } as any

    const res = createMockResponse()
    await handler(req, res as any)

    expect(res.statusCode).toBe(400)
    const json = JSON.parse(res.body)
    expect(json.error).toContain('Invalid days parameter')
  })

  it('validates area coordinate boundaries', async () => {
    const req = {
      url: '/api/firms/live?source=VIIRS_SNPP_NRT&days=3&area=999,999,999,999',
      headers: {
        'x-firms-map-key': '1234567890abcdef1234567890abcdef',
      },
    } as any

    const res = createMockResponse()
    await handler(req, res as any)

    expect(res.statusCode).toBe(400)
    const json = JSON.parse(res.body)
    expect(json.error).toContain('Invalid area bounding box coordinates')
  })

  it('handles upstream Invalid MAP_KEY rejection with 401 without credential leakage', async () => {
    process.env.NASA_FIRMS_MAP_KEY = 'invalid_mock_key_00000000000000000'

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'Invalid MAP_KEY',
    } as any)

    const req = {
      url: '/api/firms/live?source=VIIRS_SNPP_NRT&days=3&area=68,8,97,37',
      headers: {},
    } as any

    const res = createMockResponse()
    await handler(req, res as any)

    expect(res.statusCode).toBe(401)
    const json = JSON.parse(res.body)
    expect(json.error).toContain('Invalid MAP_KEY')
    expect(res.body).not.toContain(process.env.NASA_FIRMS_MAP_KEY)
  })

  it('successfully proxies upstream CSV when key is valid', async () => {
    process.env.NASA_FIRMS_MAP_KEY = 'valid_mock_key_11111111111111111'
    const mockCsv = 'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n12.5,77.5,320.5,1.0,1.0,2024-03-15,0830,Terra,MODIS,85,6.1NRT,295.2,18.4,D'

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => mockCsv,
    } as any)

    const req = {
      url: '/api/firms/live?source=MODIS_NRT&days=1&area=68,8,97,37',
      headers: {},
    } as any

    const res = createMockResponse()
    await handler(req, res as any)

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.body).toBe(mockCsv)
    expect(res.body).not.toContain(process.env.NASA_FIRMS_MAP_KEY)
  })
})
