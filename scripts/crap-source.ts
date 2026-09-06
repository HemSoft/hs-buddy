import { parser } from 'typescript-eslint'

/** Disable coverage directives only inside comments, preserving every source position. */
export function withoutCoverageIgnores(source: string, filePath: string): string {
  const parse = parser.parseForESLint as (
    code: string,
    options: { filePath: string; comment: boolean; range: boolean }
  ) => { ast: { comments?: { range: [number, number] }[] } }
  const { ast } = parse(source, { filePath, comment: true, range: true })
  let result = source
  for (const comment of [...(ast.comments ?? [])].reverse()) {
    const [start, end] = comment.range
    const text = source
      .slice(start, end)
      .replace(/\b(?:v8|c8|istanbul)(?=\s+ignore\b)/g, value => 'x'.repeat(value.length))
    result = result.slice(0, start) + text + result.slice(end)
  }
  return result
}
