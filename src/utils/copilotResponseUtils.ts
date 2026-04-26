/**
 * Pure helpers for parsing Copilot SDK response data.
 *
 * Extracted from electron/services/copilotClient.ts so they live in the
 * tested src/ surface. Uses structural types to avoid pulling in SDK deps.
 */

/** Extract the text content from an assistant message response. */
export function extractAssistantContent(
  response: { data?: { content?: unknown } } | undefined
): string {
  const content = response?.data?.content
  if (content == null) return ''
  return typeof content === 'string' ? content : JSON.stringify(content)
}
