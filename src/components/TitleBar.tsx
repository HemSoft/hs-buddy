import { useState, useRef, useEffect } from 'react'
import { Users } from 'lucide-react'
import { AboutModal } from './AboutModal'
import './TitleBar.css'

interface MenuItem {
  label?: string
  accelerator?: string
  action?: () => void
  type?: 'separator'
  disabled?: boolean
}

interface Menu {
  label: string
  items: MenuItem[]
}

export function TitleBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const menuBarRef = useRef<HTMLDivElement>(null)

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'Exit', accelerator: 'Alt+F4', action: () => window.close() }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', accelerator: 'Ctrl+Z' },
        { label: 'Redo', accelerator: 'Ctrl+Y' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'Ctrl+X' },
        { label: 'Copy', accelerator: 'Ctrl+C' },
        { label: 'Paste', accelerator: 'Ctrl+V' },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'Ctrl+A' }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In', accelerator: 'Ctrl+Num+' },
        { label: 'Zoom Out', accelerator: 'Ctrl+Num-' },
        { label: 'Reset Zoom', accelerator: 'Ctrl+Num0' },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'Ctrl+R', action: () => window.location.reload() },
        { label: 'Toggle DevTools', accelerator: 'Ctrl+Shift+I', action: () => window.ipcRenderer.send('toggle-devtools') },
        { type: 'separator' },
        { label: 'Full Screen', accelerator: 'F11' }
      ]
    },
    {
      label: 'Help',
      items: [
        { 
          label: 'About Buddy', 
          action: () => {
            setShowAbout(true)
          }
        }
      ]
    }
  ]

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMenuClick = (label: string) => {
    setOpenMenu(openMenu === label ? null : label)
  }

  const handleItemClick = (item: MenuItem) => {
    if (item.action && !item.disabled) {
      item.action()
    }
    setOpenMenu(null)
  }

  const handleMinimize = () => {
    window.ipcRenderer.send('window-minimize')
  }

  const handleMaximize = () => {
    window.ipcRenderer.send('window-maximize')
  }

  const handleClose = () => {
    window.close()
  }

  return (
    <div className="title-bar">
      <div className="title-bar-drag-region" />
      <div className="menu-bar" ref={menuBarRef}>
        {menus.map((menu) => (
          <div key={menu.label} className="menu-container">
            <button
              className={`menu-button ${openMenu === menu.label ? 'active' : ''}`}
              onClick={() => handleMenuClick(menu.label)}
              onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
            >
              {menu.label}
            </button>
            {openMenu === menu.label && (
              <div className="menu-dropdown">
                {menu.items.map((item, index) => (
                  item.type === 'separator' ? (
                    <div key={index} className="menu-separator" />
                  ) : (
                    <button
                      key={index}
                      className={`menu-item ${item.disabled ? 'disabled' : ''}`}
                      onClick={() => handleItemClick(item)}
                      disabled={item.disabled}
                    >
                      <span className="menu-item-label">{item.label}</span>
                      {item.accelerator && (
                        <span className="menu-item-accelerator">{item.accelerator}</span>
                      )}
                    </button>
                  )
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="title-bar-title">
        <span className="title-brand">HemSoft Developments</span>
        <span className="title-icon"><Users size={14} /></span>
        <span className="title-product">Buddy</span>
        <span className="title-version">V0.1.13</span>
      </div>
      <div className="window-controls">
        <button className="window-control-button" onClick={handleMinimize} title="Minimize">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect y="9" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button className="window-control-button" onClick={handleMaximize} title="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button className="window-control-button close-button" onClick={handleClose} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}
