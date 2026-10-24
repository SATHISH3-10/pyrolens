import type { IncomingMessage, ServerResponse } from 'node:http'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const urlObj = new URL(req.url || '', 'http://localhost')
    const source = urlObj.searchParams.get('source') || 'VIIRS_SNPP_NRT'
    const daysStr = urlObj.searchParams.get('days') || '3'
    const area = urlObj.searchParams.get('area') || '68,8,97,37'

    // Server-side environment key or optional header override
    const headerKey = req.headers['x-firms-map-key']
    const activeKey =
      typeof headerKey === 'string' && headerKey.trim()
        ? headerKey.trim()
        : (process.env.NASA_FIRMS_MAP_KEY || '').trim()

    if (!activeKey) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error:
            'NASA FIRMS MAP_KEY is not configured on the server. Please configure NASA_FIRMS_MAP_KEY in server environment variables or provide a key in the x-firms-map-key header.',
        }),
      )
      return
    }

    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(activeKey)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: 'Invalid MAP_KEY format. Must be an alphanumeric key.',
        }),
      )
      return
    }

    const validSources = [
      'VIIRS_SNPP_NRT',
      'MODIS_NRT',
      'VIIRS_NOAA20_NRT',
      'VIIRS_NOAA21_NRT',
      'MODIS_SP',
      'VIIRS_SNPP_SP',
      'VIIRS_NOAA20_SP',
    ]
    if (!validSources.includes(source)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: `Invalid satellite source: ${source}. Allowed: ${validSources.join(', ')}`,
        }),
      )
      return
    }

    const days = parseInt(daysStr, 10)
    if (isNaN(days) || days < 1 || days > 10) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: 'Invalid days parameter. Must be an integer between 1 and 10.',
        }),
      )
      return
    }

    const areaParts = area.split(',').map((p) => parseFloat(p.trim()))
    const [west, south, east, north] = areaParts
    if (
      areaParts.length !== 4 ||
      west === undefined ||
      south === undefined ||
      east === undefined ||
      north === undefined ||
      isNaN(west) ||
      isNaN(south) ||
      isNaN(east) ||
      isNaN(north) ||
      west < -180 ||
      west > 180 ||
      south < -90 ||
      south > 90 ||
      east < -180 ||
      east > 180 ||
      north < -90 ||
      north > 90
    ) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: 'Invalid area bounding box coordinates. Expected west,south,east,north.',
        }),
      )
      return
    }

    const upstreamUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${activeKey}/${source}/${area}/${days}`
    const upstreamResp = await fetch(upstreamUrl)

    if (!upstreamResp.ok) {
      res.statusCode = upstreamResp.status
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: `NASA FIRMS API returned HTTP ${upstreamResp.status}: ${upstreamResp.statusText}`,
        }),
      )
      return
    }

    const csvData = await upstreamResp.text()

    if (csvData.includes('Invalid MAP_KEY')) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: 'Upstream NASA FIRMS API rejected the key: Invalid MAP_KEY.',
        }),
      )
      return
    }

    if (csvData.startsWith('Error:')) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: `Upstream NASA FIRMS error: ${csvData.trim()}`,
        }),
      )
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.end(csvData)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: `Server proxy failure: ${msg}`,
      }),
    )
  }
}
