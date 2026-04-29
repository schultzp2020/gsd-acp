import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { listGsdSessions } from '../../src/acp/gsd-sessions.js'

test('listGsdSessions: respects sessionDir from gsd settings.json', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gsd-acp-test-'))
  const customSessionsDir = join(root, 'somewhere-else', '--p--')
  mkdirSync(customSessionsDir, { recursive: true })

  writeFileSync(join(root, 'settings.json'), JSON.stringify({ sessionDir: join(root, 'somewhere-else') }, null, 2), 'utf8')

  writeFileSync(
    join(customSessionsDir, 's.jsonl'),
    [
      JSON.stringify({ type: 'session', version: 3, id: 'sess-custom', timestamp: '2026-01-01T00:00:00.000Z', cwd: '/tmp/project' }),
      JSON.stringify({ type: 'message', id: 'm1', parentId: null, timestamp: '2026-01-01T00:00:01.000Z', message: { role: 'user', content: 'hi' } })
    ].join('\n') + '\n',
    { encoding: 'utf8' }
  )

  const oldEnv = process.env.GSD_HOME
  process.env.GSD_HOME = root

  try {
    const s = listGsdSessions().find(x => x.sessionId === 'sess-custom')
    assert.ok(s)
    assert.equal(s?.sessionFile, join(customSessionsDir, 's.jsonl'))
  } finally {
    if (oldEnv === undefined) delete process.env.GSD_HOME
    else process.env.GSD_HOME = oldEnv
  }
})
