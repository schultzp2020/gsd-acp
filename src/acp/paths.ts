import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Storage owned by the ACP adapter.
 *
 * We intentionally keep this separate from gsd's own ~/.gsd/agent/* directory.
 */
export function getGsdAcpDir(): string {
  return join(homedir(), '.gsd', 'gsd-acp')
}

export function getGsdAcpSessionMapPath(): string {
  return join(getGsdAcpDir(), 'session-map.json')
}
