import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Storage owned by the ACP adapter.
 *
 * We intentionally keep this separate from pi's own ~/.pi/agent/* directory.
 */
export function getGsdAcpDir(): string {
  return join(homedir(), '.pi', 'pi-acp')
}

export function getGsdAcpSessionMapPath(): string {
  return join(getGsdAcpDir(), 'session-map.json')
}
