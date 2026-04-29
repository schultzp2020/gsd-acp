import { spawn } from 'node:child_process'

const cwd = process.cwd()

await new Promise((resolve, reject) => {
  const p = spawn('npm', ['run', 'build'], { stdio: 'inherit', cwd })
  p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`build failed: ${code}`))))
})

const child = spawn('node', ['dist/index.js'], {
  cwd,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env
})

child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')

let stderrBuffer = ''
child.stderr.on('data', chunk => {
  stderrBuffer += chunk
  process.stderr.write(chunk)
})

child.stdout.on('data', chunk => process.stdout.write(chunk))

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n')
}

let sessionId = null
let buffer = ''
child.stdout.on('data', chunk => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''

  for (const line of lines) {
    if (!line.trim()) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }

    if (msg?.id === 2 && msg?.result?.sessionId && !sessionId) {
      sessionId = msg.result.sessionId

      // Check stderr for v2 init fallback message.
      const fellBackToV1 = stderrBuffer.includes('v2 init unavailable')
      console.error(`\n[smoke-v2-init] v2 init ${fellBackToV1 ? 'fell back to v1 (expected if gsd binary is pre-v2)' : 'succeeded (v2 protocol active)'}`)

      // Send a simple prompt to verify the session works regardless of protocol version.
      send({
        jsonrpc: '2.0',
        id: 3,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text: '/session' }]
        }
      })
    }

    if (msg?.id === 3) {
      setTimeout(() => child.kill('SIGTERM'), 100)
    }
  }
})

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1 } })
send({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd, mcpServers: [] } })
