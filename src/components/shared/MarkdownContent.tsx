import MarkdownPreview from '@uiw/react-markdown-preview'
import remarkGemoji from 'remark-gemoji'

interface MarkdownContentProps {
  source: string
  className?: string
}

const MARKDOWN_STYLE = { backgroundColor: 'transparent', color: 'var(--text-primary)' } as const

export function MarkdownContent({ source, className }: MarkdownContentProps) {
  return (
    <div className={className} data-color-mode="dark">
      <MarkdownPreview source={source} remarkPlugins={[remarkGemoji]} style={MARKDOWN_STYLE} />
    </div>
  )
}
