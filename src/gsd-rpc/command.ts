import { platform } from 'node:os'

export function defaultGsdCommand(): string {
  return platform() === 'win32' ? 'gsd.cmd' : 'gsd'
}

export function getGsdCommand(override?: string): string {
  return override ?? defaultGsdCommand()
}

export function shouldUseShellForGsdCommand(cmd: string): boolean {
  if (platform() !== 'win32') return false

  const normalized = cmd.trim().toLowerCase()
  return normalized.endsWith('.cmd') || normalized.endsWith('.bat')
}
