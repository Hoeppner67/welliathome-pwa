// Isolated loopback server for exercising two service-worker versions locally.
// Never use this server for real user data or deployment.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('dist')
let revision = 1
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4192')
  if (url.pathname === '/__test_update' && request.method === 'POST') {
    revision = 2
    response.end('ok')
    return
  }
  const pathname = decodeURIComponent(url.pathname)
  const requested = pathname === '/' || !path.extname(pathname) ? '/index.html' : pathname
  const file = path.resolve(root, `.${requested}`)
  if (!file.startsWith(root + path.sep)) { response.writeHead(400).end(); return }
  try {
    let contents = await readFile(file)
    if (requested === '/sw.js' && revision === 2) {
      contents = Buffer.from(contents.toString('utf8').replace(/(const VERSION = '[^']*)'/, '$1-test-update\''))
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(contents)
  } catch { response.writeHead(404).end() }
}).listen(4192, '127.0.0.1', () => console.log('Isolated PWA test: http://127.0.0.1:4192'))
