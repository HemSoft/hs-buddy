import { useState, useCallback, useEffect, useRef } from 'react'
import { IPC_INVOKE } from '../../../ipc/contracts'
import { dataCache } from '../../../services/dataCache'
import { useEscapeToClose } from '../../../hooks/useEscapeToClose'

export function useSidebarUserMenu() {
  const [favoriteUsers, setFavoriteUsers] = useState<Set<string>>(new Set())
  const hasLocalMutationRef = useRef(false)

  useEffect(() => {
    window.ipcRenderer
      .invoke(IPC_INVOKE.CONFIG_GET_FAVORITE_USERS)
      .then((users: string[]) => {
        if (!hasLocalMutationRef.current) {
          setFavoriteUsers(new Set(users))
        }
      })
      /* v8 ignore start */
      .catch(() => {
        /* use default */
      })
    /* v8 ignore stop */
  }, [])

  const persistFavoritesRef = useRef(Promise.resolve())

  const [userContextMenu, setUserContextMenu] = useState<{
    x: number
    y: number
    login: string
    org: string
  } | null>(null)

  const openUserContextMenu = useCallback((e: React.MouseEvent, org: string, login: string) => {
    e.preventDefault()
    setUserContextMenu({ x: e.clientX, y: e.clientY, login, org })
  }, [])

  const closeUserContextMenu = useCallback(() => setUserContextMenu(null), [])
  useEscapeToClose(!!userContextMenu, closeUserContextMenu)

  const toggleFavoriteUser = useCallback((org: string, login: string) => {
    const key = `${org}/${login}`
    hasLocalMutationRef.current = true
    setFavoriteUsers(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  useEffect(() => {
    if (!hasLocalMutationRef.current) return
    const snapshot = Array.from(favoriteUsers)
    persistFavoritesRef.current = persistFavoritesRef.current
      /* v8 ignore start */
      .catch(() => {})
      /* v8 ignore stop */
      .then(() => window.ipcRenderer.invoke(IPC_INVOKE.CONFIG_SET_FAVORITE_USERS, snapshot))
      /* v8 ignore start */
      .catch(() => {})
    /* v8 ignore stop */
  }, [favoriteUsers])

  const refreshUser = useCallback((org: string, login: string) => {
    const cacheKey = `user-activity:v2:${org}/${login}`
    dataCache.delete(cacheKey)
    window.dispatchEvent(
      new CustomEvent('app:navigate', {
        detail: { viewId: `org-user:${org}/${login}` },
      })
    )
  }, [])

  return {
    userContextMenu,
    setUserContextMenu,
    favoriteUsers,
    openUserContextMenu,
    toggleFavoriteUser,
    refreshUser,
  }
}
