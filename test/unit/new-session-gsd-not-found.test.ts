import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GsdAcpAgent } from '../../src/acp/agent.js'
import { FakeAgentSideConnection, asAgentConn } from '../helpers/fakes.js'

test('GsdAcpAgent: newSession returns a helpful Internal error when gsd is not installed', async () => {
  const prevAgentDir = process.env.GSD_HOME
  const prevGsdCmd = process.env.GSD_ACP_GSD_COMMAND

  const dir = mkdtempSync(join(tmpdir(), 'gsd-acp-gsd-not-found-'))
  writeFileSync(join(dir, 'auth.json'), '{"dummy":"x"}', 'utf-8')
  writeFileSync(join(dir, 'models.json'), '{}', 'utf-8')

  process.env.GSD_HOME = dir
  process.env.GSD_ACP_GSD_COMMAND = 'gsd-does-not-exist-12345'

  try {
    const conn = new FakeAgentSideConnection()
    const agent = new GsdAcpAgent(asAgentConn(conn), {} as any)

    await assert.rejects(
      () => agent.newSession({ cwd: process.cwd(), mcpServers: [] } as any),
      (e: any) => e?.code === -32603 && String(e?.message ?? '').toLowerCase().includes('executable not found')
    )
  } finally {
    if (prevAgentDir == null) delete process.env.GSD_HOME
    else process.env.GSD_HOME = prevAgentDir

    if (prevGsdCmd == null) delete process.env.GSD_ACP_GSD_COMMAND
    else process.env.GSD_ACP_GSD_COMMAND = prevGsdCmd
  }
})
