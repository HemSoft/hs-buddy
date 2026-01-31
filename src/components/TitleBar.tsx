import { useState, useRef, useEffect } from 'react'
import { X, Minimize2, Square } from 'lucide-react'
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
        { label: 'Toggle DevTools', accelerator: 'Ctrl+Shift+I' },
        { type: 'separator' },
        { label: 'Full Screen', accelerator: 'F11' }
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
        <span className="title-separator">—</span>
        <span className="title-product">hs-buddy</span>
        <span className="title-version">V0.1.0</span>
      </div>
      <div className="window-controls">
        <button className="window-control-button" onClick={handleMinimize} title="Minimize">
          <Minimize2 size={14} />
        </button>
        <button className="window-control-button" onClick={handleMaximize} title="Maximize">
          <Square size={14} />
        </button>
        <button className="window-control-button close-button" onClick={handleClose} title="Close">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
