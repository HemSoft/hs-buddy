import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FolderTree } from './FolderTree'

/**
 * Mock data for filesystem API responses
 */
const mockRootEntries = [
  { name: 'node_modules', type: 'directory' as const, size: 0 },
  { name: 'src', type: 'directory' as const, size: 0 },
  { name: 'package.json', type: 'file' as const, size: 245 },
]

const mockSrcEntries = [
  { name: 'components', type: 'directory' as const, size: 0 },
  { name: 'utils', type: 'directory' as const, size: 0 },
  { name: 'main.tsx', type: 'file' as const, size: 512 },
]

const mockComponentsEntries = [
  { name: 'Button.tsx', type: 'file' as const, size: 128 },
  { name: 'Modal.tsx', type: 'file' as const, size: 256 },
]

/**
 * Helper to create mock filesystem API responses
 */
function createMockFilesystemAPI() {
  return {
    readDir: vi.fn(async (dirPath: string) => {
      // Simulate the root directory
      if (dirPath === 'C:\\project') {
        return { error: null, entries: mockRootEntries }
      }
      // Simulate the src directory
      if (dirPath === 'C:\\project\\src') {
        return { error: null, entries: mockSrcEntries }
      }
      // Simulate the components directory
      if (dirPath === 'C:\\project\\src\\components') {
        return { error: null, entries: mockComponentsEntries }
      }
      // Default: empty directory
      return { error: null, entries: [] }
    }),
  }
}

describe('FolderTree', () => {
  beforeEach(() => {
    ;(window as any).filesystem = createMockFilesystemAPI()
  })

  afterEach(() => {
    delete (window as any).filesystem
  })

  it('renders root entries on initial mount', async () => {
    render(<FolderTree rootPath={'C:\\project'} onFileSelect={vi.fn()} />)

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('node_modules')).toBeInTheDocument()
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
  })

  it('expands a directory and loads child entries', async () => {
    render(<FolderTree rootPath={'C:\\project'} onFileSelect={vi.fn()} />)

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Click the 'src' directory to expand it
    const srcNode = screen.getByText('src').closest('li')
    expect(srcNode).toBeInTheDocument()

    fireEvent.click(srcNode!)

    // Wait for child entries to appear
    await waitFor(() => {
      expect(screen.getByText('components')).toBeInTheDocument()
      expect(screen.getByText('utils')).toBeInTheDocument()
      expect(screen.getByText('main.tsx')).toBeInTheDocument()
    })
  })

  it('toggles directory expanded state on click', async () => {
    render(<FolderTree rootPath={'C:\\project'} onFileSelect={vi.fn()} />)

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcNode = screen.getByText('src').closest('li')
    expect(srcNode).toHaveAttribute('aria-expanded', 'false')

    // Click to expand
    fireEvent.click(srcNode!)

    // Verify expanded state changed
    await waitFor(() => {
      expect(srcNode).toHaveAttribute('aria-expanded', 'true')
    })

    // Wait for children to appear before checking content
    await waitFor(() => {
      expect(screen.getByText('main.tsx')).toBeInTheDocument()
    })

    // Click to collapse
    fireEvent.click(srcNode!)

    // Verify collapsed state
    await waitFor(() => {
      expect(srcNode).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('does not load children multiple times on repeated clicks', async () => {
    const mockFilesystem = createMockFilesystemAPI()
    ;(window as any).filesystem = mockFilesystem

    render(<FolderTree rootPath={'C:\\project'} onFileSelect={vi.fn()} />)

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcNode = screen.getByText('src').closest('li')

    // First expand - should load children
    fireEvent.click(srcNode!)
    await waitFor(() => {
      expect(screen.getByText('components')).toBeInTheDocument()
    })

    const initialCallCount = mockFilesystem.readDir.mock.calls.length

    // Click to collapse
    fireEvent.click(srcNode!)
    await waitFor(() => {
      expect(srcNode).toHaveAttribute('aria-expanded', 'false')
    })

    // Click to expand again - should NOT load children again
    fireEvent.click(srcNode!)
    await waitFor(() => {
      expect(srcNode).toHaveAttribute('aria-expanded', 'true')
    })

    // Verify readDir was not called again for src
    const finalCallCount = mockFilesystem.readDir.mock.calls.length
    expect(finalCallCount).toBe(initialCallCount)
  })

  it('expands nested directories in sequence', async () => {
    render(<FolderTree rootPath={'C:\\project'} onFileSelect={vi.fn()} />)

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Expand src directory
    const srcNode = screen.getByText('src').closest('li')
    fireEvent.click(srcNode!)

    await waitFor(() => {
      expect(screen.getByText('components')).toBeInTheDocument()
    })

    // Expand components directory
    const componentsNode = screen.getByText('components').closest('li')
    fireEvent.click(componentsNode!)

    // Wait for nested children to appear
    await waitFor(() => {
      expect(screen.getByText('Button.tsx')).toBeInTheDocument()
      expect(screen.getByText('Modal.tsx')).toBeInTheDocument()
    })
  })

  it('calls onFileSelect when clicking a file', async () => {
    const onFileSelect = vi.fn()

    render(<FolderTree rootPath={'C:\\project'} onFileSelect={onFileSelect} />)

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })

    // Click on file
    const fileNode = screen.getByText('package.json').closest('li')
    fireEvent.click(fileNode!)

    expect(onFileSelect).toHaveBeenCalledWith('C:\\project\\package.json')
  })

  it('highlights selected file', async () => {
    const selectedFilePath = 'C:\\project\\package.json'

    render(
      <FolderTree rootPath={'C:\\project'} onFileSelect={vi.fn()} selectedFile={selectedFilePath} />
    )

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })

    const fileNode = screen.getByText('package.json').closest('li')
    expect(fileNode).toHaveAttribute('aria-selected', 'true')

    const srcNode = screen.getByText('src').closest('li')
    expect(srcNode).toHaveAttribute('aria-selected', 'false')
  })

  it('handles empty directories', async () => {
    ;(window as any).filesystem = {
      readDir: vi.fn(async () => {
        return { error: null, entries: [] }
      }),
    }

    render(<FolderTree rootPath={'C:\\empty'} onFileSelect={vi.fn()} />)

    // Should render without entries, but no error
    await waitFor(() => {
      expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
      expect(screen.queryByRole('tree')).toBeInTheDocument()
    })
  })

  it('renders children with correct indentation depth', async () => {
    render(<FolderTree rootPath={'C:\\project'} onFileSelect={vi.fn()} />)

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Expand src
    const srcNode = screen.getByText('src').closest('li')
    fireEvent.click(srcNode!)

    await waitFor(() => {
      expect(screen.getByText('main.tsx')).toBeInTheDocument()
    })

    // Get the row element for main.tsx
    const mainRow = screen.getByText('main.tsx').closest('.folder-tree-row')

    // Should have padding-left indicating depth > 0
    const style = window.getComputedStyle(mainRow!)
    const paddingLeft = style.paddingLeft
    expect(parseInt(paddingLeft)).toBeGreaterThan(0)
  })

  it('reproduces bug: expanding directory shows no children', async () => {
    /**
     * This test is designed to catch the bug where:
     * 1. Directory expands (aria-expanded becomes true)
     * 2. But children don't render even after loading
     *
     * This typically happens when:
     * - node.children is null/undefined after loading
     * - The render condition `isDir && node.expanded && node.children` fails
     * - Or the children state update doesn't trigger a re-render
     */

    render(<FolderTree rootPath={'C:\\project'} onFileSelect={vi.fn()} />)

    // Wait for root entries to load
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcNode = screen.getByText('src')
    const srcLi = srcNode.closest('li')

    // Before expand: aria-expanded should be false, no children visible
    expect(srcLi).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('main.tsx')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(srcLi!)

    // After expand: aria-expanded should be true
    // AND children should be visible (this is where the bug would manifest)
    await waitFor(() => {
      expect(srcLi).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('main.tsx')).toBeInTheDocument()
      expect(screen.getByText('components')).toBeInTheDocument()
      expect(screen.getByText('utils')).toBeInTheDocument()
    })
  })
})
