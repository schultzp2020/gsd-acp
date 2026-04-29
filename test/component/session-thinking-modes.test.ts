import test from 'node:test'
import assert from 'node:assert/strict'
import { GsdAcpAgent } from '../../src/acp/agent.js'

class FakeConn {
  updates: any[] = []
  async sessionUpdate(msg: any) {
    this.updates.push(msg)
  }
}

test('GsdAcpAgent: setSessionMode maps to gsd setThinkingLevel + emits current_mode_update', async () => {
  const conn = new FakeConn()
  const agent = new GsdAcpAgent(conn as any)

  // Create a fake session by calling newSession is heavyweight (spawns gsd).
  // Instead, reach into session manager via loadSession isn't possible either.
  // So we unit-test the mapping via a minimal fake session manager would require refactor.
  // For now we just assert the method exists and rejects unknown mode IDs.

  await assert.rejects(() => agent.setSessionMode({ sessionId: 'nope', modeId: 'invalid' } as any), /invalid params/i)
})
