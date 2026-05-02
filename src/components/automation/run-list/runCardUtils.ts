export function formatOutput(output: unknown): string {
  if (output === null || output === undefined) return ''
  if (typeof output === 'string') return output
  try {
    return JSON.stringify(output, null, 2)
  } catch (_: unknown) {
    return String(output)
  }
}
