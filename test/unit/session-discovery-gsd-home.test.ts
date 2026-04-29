import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('getGsdAcpDir: uses GSD_HOME/gsd-acp when GSD_HOME is set', async () => {
  const { getGsdAcpDir } = await import('../../src/acp/paths.js')

  const prevGsdHome = process.env.GSD_HOME
  const tmpDir = mkdtempSync(join(tmpdir(), 'gsd-home-test-'))
  process.env.GSD_HOME = tmpDir

  try {
    const result = getGsdAcpDir()
    assert.ok(result.replace(/\\/g, '/').endsWith('/gsd-acp'))
    assert.ok(result.replace(/\\/g, '/').startsWith(tmpDir.replace(/\\/g, '/')))
  } finally {
    if (prevGsdHome === undefined) delete process.env.GSD_HOME
    else process.env.GSD_HOME = prevGsdHome
  }
})

test('getGsdSessionsDir: uses GSD_HOME/sessions when GSD_HOME is set', async () => {
  const { getGsdSessionsDir } = await import('../../src/acp/gsd-sessions.js')

  const prevGsdHome = process.env.GSD_HOME
  const tmpDir = mkdtempSync(join(tmpdir(), 'gsd-home-test-'))
  process.env.GSD_HOME = tmpDir

  try {
    const result = getGsdSessionsDir()
    assert.ok(result.replace(/\\/g, '/').endsWith('/sessions'))
    assert.ok(result.replace(/\\/g, '/').startsWith(tmpDir.replace(/\\/g, '/')))
  } finally {
    if (prevGsdHome === undefined) delete process.env.GSD_HOME
    else process.env.GSD_HOME = prevGsdHome
  }
})

test('hasAnyGsdAuthConfigured: returns true when GSD_HOME has auth.json', async () => {
  const { hasAnyGsdAuthConfigured } = await import('../../src/gsd-auth/status.js')

  const prevGsdHome = process.env.GSD_HOME
  const tmpDir = mkdtempSync(join(tmpdir(), 'gsd-auth-test-'))

  process.env.GSD_HOME = tmpDir

  mkdirSync(tmpDir, { recursive: true })
  writeFileSync(join(tmpDir, 'auth.json'), JSON.stringify({ token: 'test' }), 'utf-8')

  const savedEnvVars: Record<string, string | undefined> = {}
  const envVarsToClear = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GITHUB_TOKEN']
  for (const k of envVarsToClear) {
    savedEnvVars[k] = process.env[k]
    delete process.env[k]
  }

  try {
    const result = hasAnyGsdAuthConfigured()
    assert.equal(result, true)
  } finally {
    if (prevGsdHome === undefined) delete process.env.GSD_HOME
    else process.env.GSD_HOME = prevGsdHome

    for (const [k, v] of Object.entries(savedEnvVars)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('listGsdSessions: discovers sessions under GSD_HOME/sessions', async () => {
  const { listGsdSessions } = await import('../../src/acp/gsd-sessions.js')

  const prevGsdHome = process.env.GSD_HOME
  const tmpDir = mkdtempSync(join(tmpdir(), 'gsd-sessions-test-'))
  const sessionsDir = join(tmpDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })

  writeFileSync(
    join(sessionsDir, 'test-session.jsonl'),
    [
      JSON.stringify({
        type: 'session',
        version: 3,
        id: 'gsd-sess-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        cwd: '/tmp/gsd-project'
      }),
      JSON.stringify({
        type: 'message',
        id: 'm1',
        timestamp: '2026-01-01T00:00:01.000Z',
        message: { role: 'user', content: 'test' }
      })
    ].join('\n') + '\n',
    'utf-8'
  )

  process.env.GSD_HOME = tmpDir

  try {
    const sessions = listGsdSessions()
    const found = sessions.find((s: { sessionId: string }) => s.sessionId === 'gsd-sess-1')
    assert.ok(found)
    assert.equal(found!.cwd, '/tmp/gsd-project')
  } finally {
    if (prevGsdHome === undefined) delete process.env.GSD_HOME
    else process.env.GSD_HOME = prevGsdHome
  }
})
