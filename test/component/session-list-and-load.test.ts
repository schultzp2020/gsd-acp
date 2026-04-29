import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GsdAcpAgent } from '../../src/acp/agent.js'
import { FakeAgentSideConnection, asAgentConn } from '../helpers/fakes.js'

// We mock GsdRpcProcess.spawn so loadSession doesn't actually spawn `gsd`.
import { GsdRpcProcess } from '../../src/gsd-rpc/process.js'

test('GsdAcpAgent: unstable_listSessions lists gsd sessions and loadSession replays history', async () => {
  // Create a fake GSD_HOME with one session.
  const root = mkdtempSync(join(tmpdir(), 'gsd-acp-test-'))
  const sessionsDir = join(root, 'sessions', '--tmp--project--')
  const sessionFile = join(sessionsDir, '0000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jsonl')

  // Ensure parent dirs.
  mkdirSync(sessionsDir, { recursive: true })

  writeFileSync(
    sessionFile,
    [
      JSON.stringify({
        type: 'session',
        version: 3,
        id: 'sess-1',
        timestamp: '2026-02-11T00:00:00.000Z',
        cwd: '/tmp/project'
      }),
      JSON.stringify({
        type: 'message',
        id: 'a1b2c3d4',
        parentId: null,
        timestamp: '2026-02-11T00:00:01.000Z',
        message: { role: 'user', content: 'Hello' }
      }),
      JSON.stringify({
        type: 'message',
        id: 'b2c3d4e5',
        parentId: 'a1b2c3d4',
        timestamp: '2026-02-11T00:00:02.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] }
      }),
      JSON.stringify({
        type: 'session_info',
        id: 'c3d4e5f6',
        parentId: 'b2c3d4e5',
        timestamp: '2026-02-11T00:00:03.000Z',
        name: 'My Named Session'
      })
    ].join('\n') + '\n',
    { encoding: 'utf8' }
  )

  const oldEnv = process.env.GSD_HOME
  process.env.GSD_HOME = root

  try {
    const conn = new FakeAgentSideConnection()
    const agent = new GsdAcpAgent(asAgentConn(conn))

    // 1) list sessions
    const listed = await agent.unstable_listSessions({ cwd: null, cursor: null, _meta: null } as any)
    assert.ok(listed.sessions.length >= 1)

    const s = listed.sessions.find(x => x.sessionId === 'sess-1')
    assert.ok(s)
    assert.equal(s?.cwd, '/tmp/project')
    assert.equal(s?.title, 'My Named Session')

    // 2) load session: mock spawn to return fake proc with getMessages
    const originalSpawn = GsdRpcProcess.spawn

    ;(GsdRpcProcess as any).spawn = async (params: any) => {
      assert.ok(typeof params.sessionPath === 'string')
      assert.ok(params.sessionPath.includes('0000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jsonl'))

      return {
        onEvent: () => () => {
          // noop unsubscribe
        },
        getMessages: async () => ({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] }
          ]
        }),
        getAvailableModels: async () => ({ models: [] }),
        getState: async () => ({ thinkingLevel: 'medium' })
      } as any
    }

    try {
      await agent.loadSession({ sessionId: 'sess-1', cwd: '/tmp/project', mcpServers: [], _meta: null } as any)

      // loadSession should have replayed messages as session/update notifications.
      const texts = conn.updates
        .map(u => (u as any).update)
        .filter(Boolean)
        .map(u => ({ kind: u.sessionUpdate, text: u.content?.text }))

      assert.ok(texts.some(t => t.kind === 'user_message_chunk' && t.text === 'Hello'))
      assert.ok(texts.some(t => t.kind === 'agent_message_chunk' && t.text === 'Hi there!'))
    } finally {
      GsdRpcProcess.spawn = originalSpawn
    }
  } finally {
    if (oldEnv === undefined) delete process.env.GSD_HOME
    else process.env.GSD_HOME = oldEnv
  }
})
