import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('allotment', () => {
  const Pane = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="allotment-pane">{children}</div>
  )
  const Allotment = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="allotment">{children}</div>
  )
  Allotment.Pane = Pane
  return { Allotment }
})

vi.mock('./FolderTree', () => ({
  FolderTree: ({
    rootPath,
    onFileSelect,
    selectedFile,
  }: {
    rootPath: string
    onFileSelect: (path: string) => void
    selectedFile?: string
  }) => (
    <div
      data-testid="folder-tree"
      data-root-path={rootPath}
      data-selected-file={selectedFile ?? ''}
    >
      <button
        data-testid="select-file-btn"
        onClick={() => onFileSelect('C:\\project\\src\\main.tsx')}
      >
        Select file
      </button>
    </div>
  ),
}))

vi.mock('./FilePreview', () => ({
  FilePreview: ({ filePath }: { filePath: string }) => (
    <div data-testid="file-preview">{filePath}</div>
  ),
}))

vi.mock('lucide-react', () => ({
  FolderOpen: (props: Record<string, unknown>) => <svg data-testid="icon-folder-open" {...props} />,
  FileText: (props: Record<string, unknown>) => <svg data-testid="icon-file-text" {...props} />,
}))

vi.mock('./FolderExplorerView.css', () => ({}))

import { FolderExplorerView } from './FolderExplorerView'

afterEach(cleanup)

describe('FolderExplorerView', () => {
  it('extracts folder name from a backslash-separated rootPath', () => {
    render(<FolderExplorerView rootPath={'C:\\Users\\dev\\project'} />)
    expect(screen.getByText('project')).toBeInTheDocument()
  })

  it('extracts folder name from a forward-slash rootPath (normalized)', () => {
    render(<FolderExplorerView rootPath={'C:/Users/dev/my-app'} />)
    expect(screen.getByText('my-app')).toBeInTheDocument()
  })

  it('uses rootPath as-is when it contains no separators', () => {
    render(<FolderExplorerView rootPath={'standalone'} />)
    expect(screen.getByText('standalone')).toBeInTheDocument()
  })

  it('shows empty state with "Select a file to preview" when no file is selected', () => {
    render(<FolderExplorerView rootPath={'C:\\project'} />)
    expect(screen.getByText('Select a file to preview')).toBeInTheDocument()
    expect(screen.getByTestId('icon-file-text')).toBeInTheDocument()
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument()
  })

  it('shows FilePreview after selecting a file via FolderTree callback', () => {
    render(<FolderExplorerView rootPath={'C:\\project'} />)
    fireEvent.click(screen.getByTestId('select-file-btn'))
    expect(screen.getByTestId('file-preview')).toHaveTextContent('C:\\project\\src\\main.tsx')
    expect(screen.queryByText('Select a file to preview')).not.toBeInTheDocument()
  })

  it('passes correct rootPath and selectedFile props to FolderTree', () => {
    render(<FolderExplorerView rootPath={'C:\\project'} />)
    const tree = screen.getByTestId('folder-tree')
    expect(tree).toHaveAttribute('data-root-path', 'C:\\project')
    expect(tree).toHaveAttribute('data-selected-file', '')

    fireEvent.click(screen.getByTestId('select-file-btn'))
    expect(tree).toHaveAttribute('data-selected-file', 'C:\\project\\src\\main.tsx')
  })

  it('displays rootPath in the title attribute of the sidebar header', () => {
    const { container } = render(<FolderExplorerView rootPath={'C:\\Users\\dev\\project'} />)
    const titleSpan = container.querySelector('.folder-explorer-sidebar-title')
    expect(titleSpan).toBeInTheDocument()
    expect(titleSpan).toHaveAttribute('title', 'C:\\Users\\dev\\project')
  })

  it('falls back to full rootPath when path ends with a separator', () => {
    render(<FolderExplorerView rootPath={'C:\\'} />)
    expect(screen.getByText('C:\\')).toBeInTheDocument()
  })
})
