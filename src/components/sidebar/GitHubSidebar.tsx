import {
  ChevronDown,
  ChevronRight,
  GitPullRequest,
  Building2,
} from 'lucide-react'
import { SidebarPRContextMenu } from './github-sidebar/SidebarPRContextMenu'
import { PRTreeSection } from './github-sidebar/PRTreeSection'
import { OrgRepoTree } from './github-sidebar/OrgRepoTree'
import { useGitHubSidebarData } from './github-sidebar/useGitHubSidebarData'

interface GitHubSidebarProps {
  onItemSelect: (itemId: string) => void
  selectedItem: string | null
  counts: Record<string, number>
  badgeProgress: Record<string, { progress: number; color: string; tooltip: string }>
}

export function GitHubSidebar({ onItemSelect, selectedItem, counts, badgeProgress }: GitHubSidebarProps) {
  const {
    prContextMenu, setPrContextMenu,
    approvingPrKey,
    bookmarkedRepoKeys,
    expandedSections,
    prItems,
    prTreeData,
    expandedPrGroups,
    expandedPRNodes,
    uniqueOrgs,
    orgRepos,
    orgMeta,
    loadingOrgs,
    expandedOrgs,
    expandedRepos,
    expandedRepoPRGroups,
    repoCounts,
    loadingRepoCounts,
    repoPrTreeData,
    showBookmarkedOnly,
    setShowBookmarkedOnly,
    refreshTick,
    toggleSection,
    toggleOrg,
    toggleRepo,
    toggleRepoPRGroup,
    togglePRGroup,
    togglePRNode,
    openTreePRContextMenu,
    handleBookmarkToggle,
    handleApprovePR,
    copyToClipboard,
    openPRReview,
    toggleBookmarkRepoByValues,
  } = useGitHubSidebarData()

  return (
    <div className="sidebar-panel">
      {prContextMenu && (
        <SidebarPRContextMenu
          pr={prContextMenu.pr}
          x={prContextMenu.x}
          y={prContextMenu.y}
          approvingPrKey={approvingPrKey}
          bookmarkedRepoKeys={bookmarkedRepoKeys}
          onOpen={() => { window.shell.openExternal(prContextMenu.pr.url); setPrContextMenu(null) }}
          onCopyLink={async () => {
            try { await copyToClipboard(prContextMenu.pr.url) } catch (error) { console.error('Failed to copy PR link:', error) }
            setPrContextMenu(null)
          }}
          onAIReview={() => { openPRReview(prContextMenu.pr); setPrContextMenu(null) }}
          onApprove={async () => { await handleApprovePR(prContextMenu.pr); setPrContextMenu(null) }}
          onBookmark={async () => {
            const pr = prContextMenu.pr
            await toggleBookmarkRepoByValues(pr.org || '', pr.repository, pr.url.replace(/\/pull\/\d+$/, ''))
            setPrContextMenu(null)
          }}
          onClose={() => setPrContextMenu(null)}
        />
      )}
      <div className="sidebar-panel-header">
        <h2>GITHUB</h2>
      </div>
      <div className="sidebar-panel-content">
        {/* Pull Requests group */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" role="button" tabIndex={0} onClick={() => toggleSection('pull-requests')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('pull-requests') } }}>
            <div className="sidebar-section-title">
              {expandedSections.has('pull-requests') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="sidebar-section-icon"><GitPullRequest size={16} /></span>
              <span>Pull Requests</span>
            </div>
          </div>
          {expandedSections.has('pull-requests') && (
            <div className="sidebar-section-items">
              <PRTreeSection
                prItems={prItems}
                prTreeData={prTreeData}
                expandedPrGroups={expandedPrGroups}
                expandedPRNodes={expandedPRNodes}
                counts={counts}
                badgeProgress={badgeProgress}
                selectedItem={selectedItem}
                onItemSelect={onItemSelect}
                onTogglePRGroup={togglePRGroup}
                onTogglePRNode={togglePRNode}
                onContextMenu={openTreePRContextMenu}
              />
            </div>
          )}
        </div>

        {/* Organizations group */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" role="button" tabIndex={0} onClick={() => toggleSection('organizations')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('organizations') } }}>
            <div className="sidebar-section-title">
              {expandedSections.has('organizations') ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="sidebar-section-icon"><Building2 size={16} /></span>
              <span>Organizations</span>
            </div>
          </div>
          {expandedSections.has('organizations') && (
            <OrgRepoTree
              uniqueOrgs={uniqueOrgs}
              orgRepos={orgRepos}
              orgMeta={orgMeta}
              loadingOrgs={loadingOrgs}
              expandedOrgs={expandedOrgs}
              expandedRepos={expandedRepos}
              expandedRepoPRGroups={expandedRepoPRGroups}
              expandedPRNodes={expandedPRNodes}
              repoCounts={repoCounts}
              loadingRepoCounts={loadingRepoCounts}
              repoPrTreeData={repoPrTreeData}
              bookmarkedRepoKeys={bookmarkedRepoKeys}
              showBookmarkedOnly={showBookmarkedOnly}
              selectedItem={selectedItem}
              refreshTick={refreshTick}
              onToggleOrg={toggleOrg}
              onToggleRepo={toggleRepo}
              onToggleRepoPRGroup={toggleRepoPRGroup}
              onTogglePRNode={togglePRNode}
              onItemSelect={onItemSelect}
              onContextMenu={openTreePRContextMenu}
              onBookmarkToggle={handleBookmarkToggle}
              onToggleShowBookmarkedOnly={() => {
                setShowBookmarkedOnly(prev => {
                  const next = !prev
                  window.ipcRenderer.invoke('config:set-show-bookmarked-only', next).catch(() => {})
                  return next
                })
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
