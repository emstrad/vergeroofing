// Minimal req/res stand-ins. The handlers only ever touch these members, and a
// real server in the loop would test http rather than the code under test.
import { Readable } from 'node:stream'

export function makeReq(options = {}) {
  const body = options.body === undefined ? null : JSON.stringify(options.body)
  const stream = Readable.from(body ? [Buffer.from(body)] : [])
  stream.method = options.method || 'POST'
  stream.url = options.url || '/api/lead'
  stream.headers = {
    host: 'vergeroofing.com',
    'user-agent': 'Mozilla/5.0 (Macintosh)',
    ...(options.headers || {})
  }
  stream.socket = { remoteAddress: options.ip || '203.0.113.7' }
  stream.query = options.query || {}
  return stream
}

export function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : null
    }
  }
}
