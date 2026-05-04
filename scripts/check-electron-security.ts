/**
 * Electron Security Check
 *
 * Static analysis for Electron security misconfigurations. Replaces the
 * deprecated `electronegativity` tool with targeted, project-specific checks
 * that verify our security invariants:
 *
 * - contextIsolation must be true
 * - nodeIntegration must be false
 * - webSecurity must not be disabled
 * - No use of `shell.openExternal` with unvalidated URLs
 * - No use of `BrowserWindow.loadURL` without DNS/private-host validation
 * - No use of `setWindowOpenHandler` without URL validation
 * - No use of `eval()` or `new Function()` in main process
 *
 * LIMITATIONS (defense-in-depth, not a sole gate):
 * This tool uses regex-based heuristics. It can be bypassed by multi-line
 * variable indirection, computed property names, or dynamic spreads.
 * The multi-line BrowserWindow block scanner (below) mitigates some of these
 * gaps but cannot replace AST-based analysis or code review. This CI check
 * is one layer in the security review process, not a replacement for human
 * review of security-critical Electron changes.
 *
 * Run: bun scripts/check-electron-security.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

interface Finding {
  file: string
  line: number
  severity: 'high' | 'medium' | 'info'
  rule: string
  message: string
}

const findings: Finding[] = []
const electronDir = join(process.cwd(), 'electron')

function walkDir(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      files.push(...walkDir(full))
    } else if (full.endsWith('.ts') || full.endsWith('.js')) {
      files.push(full)
    }
  }
  return files
}

interface SecurityRule {
  pattern: RegExp
  severity: 'high' | 'medium' | 'info'
  rule: string
  message: string
  /** Optional: skip if line looks like a comment */
  skipComments?: boolean
  /** Optional: lines before/after to include in context (default: 5) */
  contextSize?: number
  /** Optional: contextual validation (receives surrounding lines) */
  contextCheck?: (context: string) => boolean
}

const securityRules: SecurityRule[] = [
  {
    pattern: /nodeIntegration\s*:\s*true/,
    severity: 'high',
    rule: 'no-node-integration',
    message: 'nodeIntegration must be false — renderer has access to Node.js APIs',
    skipComments: true,
  },
  {
    pattern: /contextIsolation\s*:\s*false/,
    severity: 'high',
    rule: 'require-context-isolation',
    message: 'contextIsolation must be true — preload scripts share context with renderer',
    skipComments: true,
  },
  {
    pattern: /webSecurity\s*:\s*false/,
    severity: 'high',
    rule: 'no-disable-web-security',
    message: 'webSecurity must not be disabled — allows cross-origin attacks',
    skipComments: true,
  },
  {
    pattern: /webviewTag\s*:\s*true/,
    severity: 'info',
    rule: 'no-webview-tag',
    message:
      'webviewTag should be false — webviews have access to Node.js APIs and can bypass security restrictions',
    skipComments: true,
  },
  {
    pattern: /allowRunningInsecureContent\s*:\s*true/,
    severity: 'high',
    rule: 'no-insecure-content',
    message: 'allowRunningInsecureContent must not be true',
    skipComments: true,
  },
  {
    pattern: /\beval\s*\(/,
    severity: 'medium',
    rule: 'no-eval',
    message: 'eval() in main process is a code injection risk',
    skipComments: true,
  },
  {
    pattern: /new\s+Function\s*\(/,
    severity: 'medium',
    rule: 'no-function-constructor',
    message: 'new Function() is equivalent to eval() — code injection risk',
    skipComments: true,
  },
  {
    pattern: /shell\.openExternal\s*\(/,
    severity: 'medium',
    rule: 'validate-external-urls',
    message: 'shell.openExternal should validate URLs before opening',
    contextCheck: ctx => !/validateUrl|isPrivateIP|isInternalHostname/.test(ctx),
  },
  {
    pattern: /\.loadURL\s*\(/,
    severity: 'medium',
    rule: 'validate-loadurl',
    message:
      'BrowserWindow.loadURL should validate URLs with DNS/private-host checks and protect against redirect-based SSRF (will-redirect handler)',
    contextSize: 50,
    contextCheck: ctx => {
      // Allow the dev server URL (always safe — local Vite server)
      if (/VITE_DEV_SERVER_URL/.test(ctx)) return false
      // Require BOTH DNS validation AND redirect protection to suppress.
      // This reduces false negatives: each loadURL site must demonstrate
      // its own complete validation chain, not just be near one.
      const hasDnsValidation = /validateUrlWithDns|isPrivateIP/.test(ctx)
      const hasRedirectProtection = /will-redirect|onBeforeRequest/.test(ctx)
      const hasNavigateProtection = /will-navigate/.test(ctx)
      return !(hasDnsValidation && hasRedirectProtection && hasNavigateProtection)
    },
  },
  {
    pattern: /setWindowOpenHandler\s*\(/,
    severity: 'medium',
    rule: 'validate-window-open',
    message: 'setWindowOpenHandler should validate URLs before loading them into BrowserWindow',
    contextSize: 50,
    contextCheck: ctx => {
      // Require that the handler either directly validates URLs or delegates
      // to guardedNavigate (which itself performs DNS validation).
      // The check requires guardedNavigate to co-exist with validateUrlWithDns
      // in context, proving the guarded path actually validates.
      const usesGuardedNavigate = /guardedNavigate/.test(ctx)
      const hasDirectValidation = /validateUrlWithDns|validateUrl|isPrivateIP/.test(ctx)
      return !(usesGuardedNavigate && hasDirectValidation)
    },
  },
]

/** Returns true when the line is a comment (single-line, block-continuation, or inline block). */
function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

function checkFile(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const rel = relative(process.cwd(), filePath)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    for (const rule of securityRules) {
      if (!rule.pattern.test(line)) continue
      if (rule.skipComments && isCommentLine(line)) continue
      if (rule.contextCheck) {
        const size = rule.contextSize ?? 5
        const context = lines.slice(Math.max(0, i - size), i + size).join('\n')
        if (!rule.contextCheck(context)) continue
      }
      findings.push({
        file: rel,
        line: lineNum,
        severity: rule.severity,
        rule: rule.rule,
        message: rule.message,
      })
    }
  }
}

interface InsecureSettingDef {
  pattern: RegExp
  keyword: string
  rule: string
  message: string
  severity?: 'high' | 'medium' | 'info'
}

const insecureSettings: InsecureSettingDef[] = [
  {
    pattern: /nodeIntegration\s*:\s*true/,
    keyword: 'nodeIntegration',
    rule: 'no-node-integration-multiline',
    message: 'nodeIntegration: true found in BrowserWindow config block (multi-line detection)',
  },
  {
    pattern: /contextIsolation\s*:\s*false/,
    keyword: 'contextIsolation',
    rule: 'require-context-isolation-multiline',
    message: 'contextIsolation: false found in BrowserWindow config block (multi-line detection)',
  },
  {
    pattern: /webSecurity\s*:\s*false/,
    keyword: 'webSecurity',
    rule: 'no-disable-web-security-multiline',
    message: 'webSecurity: false found in BrowserWindow config block (multi-line detection)',
  },
  {
    pattern: /webviewTag\s*:\s*true/,
    keyword: 'webviewTag',
    rule: 'no-webview-tag-multiline',
    message: 'webviewTag: true found in BrowserWindow config block (multi-line detection)',
    severity: 'info',
  },
]

/** Find the end index of a balanced brace/paren block starting from startIdx. */
function findMatchingClose(content: string, startIdx: number): number {
  let depth = 1
  let endIdx = startIdx
  for (let i = startIdx; i < content.length && depth > 0; i++) {
    if (content[i] === '(' || content[i] === '{') depth++
    else if (content[i] === ')' || content[i] === '}') depth--
    endIdx = i
  }
  return endIdx
}

/**
 * Multi-line BrowserWindow config check.
 *
 * The line-by-line regex rules above catch literal same-line patterns. This
 * function supplements them by scanning for `new BrowserWindow({...})`
 * construction blocks and checking whether insecure settings appear anywhere
 * within the options object — even when spread across multiple lines or
 * assembled via variables.
 *
 * This is heuristic: a variable-indirection or dynamic spread can still evade
 * detection. This tool is defense-in-depth; code review remains the primary
 * gate for security-critical changes.
 */
function checkBrowserWindowBlocks(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8')
  const rel = relative(process.cwd(), filePath)

  const bwRegex = /new\s+BrowserWindow\s*\(/g
  let match: RegExpExecArray | null
  while ((match = bwRegex.exec(content)) !== null) {
    const startIdx = match.index + match[0].length
    const endIdx = findMatchingClose(content, startIdx)
    const block = content.slice(match.index, endIdx + 1)
    const lineNum = content.slice(0, match.index).split('\n').length

    for (const setting of insecureSettings) {
      if (setting.pattern.test(block) && !isEntireBlockComment(block, setting.keyword)) {
        findings.push({
          file: rel,
          line: lineNum,
          severity: setting.severity ?? 'high',
          rule: setting.rule,
          message: setting.message,
        })
      }
    }
  }
}

/** Returns true if the given keyword appears only inside a comment in the block. */
function isEntireBlockComment(block: string, keyword: string): boolean {
  const lines = block.split('\n')
  for (const line of lines) {
    if (new RegExp(keyword).test(line) && !isCommentLine(line)) {
      return false
    }
  }
  return true
}

// Run checks
const files = walkDir(electronDir)
for (const file of files) {
  // Skip test files
  if (file.includes('.test.')) continue
  checkFile(file)
  checkBrowserWindowBlocks(file)
}

// Report results
const highCount = findings.filter(f => f.severity === 'high').length
const mediumCount = findings.filter(f => f.severity === 'medium').length
const infoCount = findings.filter(f => f.severity === 'info').length

console.log('🔒 Electron Security Check')
console.log('═'.repeat(50))
console.log(`Scanned: ${files.filter(f => !f.includes('.test.')).length} files`)
console.log(`Findings: ${highCount} high, ${mediumCount} medium, ${infoCount} info`)
console.log()

if (findings.length === 0) {
  console.log('✅ No security issues found')
  process.exit(0)
}

for (const f of findings) {
  const icon = f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : 'ℹ️'
  console.log(`${icon} [${f.severity.toUpperCase()}] ${f.file}:${f.line}`)
  console.log(`   Rule: ${f.rule}`)
  console.log(`   ${f.message}`)
  console.log()
}

// Exit non-zero for high or medium severity findings
process.exit(highCount > 0 || mediumCount > 0 ? 1 : 0)
