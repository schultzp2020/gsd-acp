export function normalizeGsdMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((c: any) => (c?.type === 'text' && typeof c.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('')
}

export function normalizeGsdAssistantText(content: unknown): string {
  // Assistant content is typically an array of blocks; only replay text blocks for MVP.
  if (!Array.isArray(content)) return ''
  return content
    .map((c: any) => (c?.type === 'text' && typeof c.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('')
}
