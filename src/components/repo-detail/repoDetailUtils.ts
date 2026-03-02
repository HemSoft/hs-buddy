/** Format bytes into human-readable size */
export function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

/** Format a date string into a readable format */
export function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Get a color for a programming language */
export function getLanguageColor(lang: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572a5',
    Java: '#b07219',
    'C#': '#178600',
    Go: '#00add8',
    Rust: '#dea584',
    Ruby: '#701516',
    PHP: '#4f5d95',
    Swift: '#f05138',
    Kotlin: '#a97bff',
    Dart: '#00b4ab',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Dockerfile: '#384d54',
    HCL: '#844fba',
    Markdown: '#083fa1',
    SCSS: '#c6538c',
    Vue: '#41b883',
    Svelte: '#ff3e00',
    Lua: '#000080',
    PowerShell: '#012456',
    Bicep: '#519aba',
    C: '#555555',
    'C++': '#f34b7d',
  }
  return colors[lang] || '#8b8b8b'
}

import { CheckCircle2, XCircle, AlertCircle, Clock, Loader2 } from 'lucide-react'

/** Get CI/CD status color and icon */
export function getWorkflowStatusInfo(status: string, conclusion: string | null) {
  if (status === 'completed') {
    switch (conclusion) {
      case 'success':
        return { color: 'var(--accent-success)', icon: CheckCircle2, label: 'Passing' }
      case 'failure':
        return { color: 'var(--accent-error)', icon: XCircle, label: 'Failing' }
      case 'cancelled':
        return { color: 'var(--text-secondary)', icon: XCircle, label: 'Cancelled' }
      default:
        return { color: 'var(--accent-warning)', icon: AlertCircle, label: conclusion || 'Unknown' }
    }
  }
  if (status === 'in_progress') {
    return { color: 'var(--accent-warning)', icon: Loader2, label: 'Running' }
  }
  return { color: 'var(--text-secondary)', icon: Clock, label: status }
}
