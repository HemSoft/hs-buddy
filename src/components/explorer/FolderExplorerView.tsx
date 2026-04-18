import { useState, useCallback } from 'react'
import { Allotment } from 'allotment'
import { FolderTree } from './FolderTree'
import { FilePreview } from './FilePreview'
import { FolderOpen, FileText } from 'lucide-react'
import './FolderExplorerView.css'

interface FolderExplorerViewProps {
  rootPath: string
}

export function FolderExplorerView({ rootPath }: FolderExplorerViewProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const handleFileSelect = useCallback((filePath: string) => {
    setSelectedFile(filePath)
  }, [])

  // Extract folder name from path for display
  const folderName = rootPath.replace(/\//g, '\\').split('\\').pop() || rootPath

  return (
    <div className="folder-explorer-view">
      <Allotment>
        <Allotment.Pane minSize={180} preferredSize={240} maxSize={500}>
          <div className="folder-explorer-sidebar">
            <div className="folder-explorer-sidebar-header">
              <FolderOpen size={12} />
              <span className="folder-explorer-sidebar-title" title={rootPath}>
                {folderName}
              </span>
            </div>
            <div className="folder-explorer-sidebar-body">
              <FolderTree
                rootPath={rootPath}
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile ?? undefined}
              />
            </div>
          </div>
        </Allotment.Pane>
        <Allotment.Pane minSize={300}>
          {selectedFile ? (
            <FilePreview filePath={selectedFile} />
          ) : (
            <div className="file-preview-empty">
              <FileText size={48} />
              <span>Select a file to preview</span>
            </div>
          )}
        </Allotment.Pane>
      </Allotment>
    </div>
  )
}
