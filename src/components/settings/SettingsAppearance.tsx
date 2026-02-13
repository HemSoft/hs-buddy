import { useState, useEffect, useCallback } from 'react';
import { useConfig } from '../../hooks/useConfig';
import { Palette, RefreshCw, Moon, Sun, Type, RotateCcw } from 'lucide-react';
import './SettingsShared.css';
import './SettingsAppearance.css';

// Helper to lighten a hex color for hover state
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Default colors for reset
const DARK_DEFAULTS = {
  accentColor: '#0e639c',
  fontColor: '#cccccc',
  bgPrimary: '#1e1e1e',
  bgSecondary: '#252526',
  statusBarBg: '#181818',
  statusBarFg: '#9d9d9d',
};

const LIGHT_DEFAULTS = {
  accentColor: '#0078d4',
  fontColor: '#1f1f1f',
  bgPrimary: '#ffffff',
  bgSecondary: '#f3f3f3',
  statusBarBg: '#f3f3f3',
  statusBarFg: '#616161',
};

/** Color definition for the picker grid */
interface ColorDef {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (color: string) => void;
}

/** Compact inline color picker */
function ColorPicker({ id, label, hint, value, onChange }: ColorDef) {
  return (
    <div className="color-cell" title={hint}>
      <div className="color-cell-header">
        <input
          type="color"
          id={id}
          className="color-swatch"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="color-cell-info">
          <label htmlFor={id}>{label}</label>
          <input
            type="text"
            className="color-hex"
            value={value}
            onChange={(e) => {
              if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                onChange(e.target.value);
              }
            }}
            placeholder={value}
          />
        </div>
      </div>
      <span className="color-cell-hint">{hint}</span>
    </div>
  );
}

export function SettingsAppearance() {
  const { config, loading, api } = useConfig();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [accentColor, setAccentColor] = useState('#0e639c');
  const [fontColor, setFontColor] = useState('#cccccc');
  const [bgPrimary, setBgPrimary] = useState('#1e1e1e');
  const [bgSecondary, setBgSecondary] = useState('#252526');
  const [statusBarBg, setStatusBarBg] = useState('#181818');
  const [statusBarFg, setStatusBarFg] = useState('#9d9d9d');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [monoFontFamily, setMonoFontFamily] = useState('Cascadia Code');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsLoading, setFontsLoading] = useState(true);

  // Load system fonts once
  useEffect(() => {
    api.getSystemFonts().then((fonts) => {
      setSystemFonts(fonts);
      setFontsLoading(false);
    }).catch(() => {
      setFontsLoading(false);
    });
  }, [api]);

  // Sync state with config
  useEffect(() => {
    if (config) {
      setTheme(config.ui.theme);
      setAccentColor(config.ui.accentColor || '#0e639c');
      setFontColor(config.ui.fontColor || '#cccccc');
      setBgPrimary(config.ui.bgPrimary || '#1e1e1e');
      setBgSecondary(config.ui.bgSecondary || '#252526');
      setStatusBarBg(config.ui.statusBarBg || '#181818');
      setStatusBarFg(config.ui.statusBarFg || '#9d9d9d');
      setFontFamily(config.ui.fontFamily || 'Inter');
      setMonoFontFamily(config.ui.monoFontFamily || 'Cascadia Code');
    }
  }, [config]);

  // Apply colors to CSS variables
  const applyColors = useCallback((accent: string, fontClr: string, primary: string, secondary: string, sbBg?: string, sbFg?: string) => {
    const root = document.documentElement;
    root.style.setProperty('--accent-primary', accent);
    root.style.setProperty('--accent-primary-hover', lightenColor(accent, 15));
    root.style.setProperty('--border-focus', accent);
    root.style.setProperty('--text-primary', fontClr);
    root.style.setProperty('--text-heading', lightenColor(fontClr, 20));
    root.style.setProperty('--bg-primary', primary);
    root.style.setProperty('--panel-bg', primary);
    root.style.setProperty('--input-bg', primary);
    root.style.setProperty('--bg-secondary', secondary);
    root.style.setProperty('--sidebar-bg', secondary);
    if (sbBg) root.style.setProperty('--statusbar-bg', sbBg);
    if (sbFg) root.style.setProperty('--statusbar-fg', sbFg);
  }, []);

  const handleThemeChange = async (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Reset colors to theme defaults when switching themes
    const defaults = newTheme === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS;
    setAccentColor(defaults.accentColor);
    setFontColor(defaults.fontColor);
    setBgPrimary(defaults.bgPrimary);
    setBgSecondary(defaults.bgSecondary);
    setStatusBarBg(defaults.statusBarBg);
    setStatusBarFg(defaults.statusBarFg);
    
    // Clear inline styles so CSS variables take effect
    const root = document.documentElement;
    root.style.removeProperty('--accent-primary');
    root.style.removeProperty('--accent-primary-hover');
    root.style.removeProperty('--border-focus');
    root.style.removeProperty('--text-primary');
    root.style.removeProperty('--text-heading');
    root.style.removeProperty('--bg-primary');
    root.style.removeProperty('--panel-bg');
    root.style.removeProperty('--input-bg');
    root.style.removeProperty('--bg-secondary');
    root.style.removeProperty('--sidebar-bg');
    root.style.removeProperty('--statusbar-bg');
    root.style.removeProperty('--statusbar-fg');
    
    await api.setTheme(newTheme);
    await api.setAccentColor(defaults.accentColor);
    await api.setFontColor(defaults.fontColor);
    await api.setBgPrimary(defaults.bgPrimary);
    await api.setBgSecondary(defaults.bgSecondary);
    await api.setStatusBarBg(defaults.statusBarBg);
    await api.setStatusBarFg(defaults.statusBarFg);
  };

  const handleAccentChange = async (color: string) => {
    setAccentColor(color);
    applyColors(color, fontColor, bgPrimary, bgSecondary, statusBarBg, statusBarFg);
    await api.setAccentColor(color);
  };

  const handleFontColorChange = async (color: string) => {
    setFontColor(color);
    applyColors(accentColor, color, bgPrimary, bgSecondary, statusBarBg, statusBarFg);
    await api.setFontColor(color);
  };

  const handleBgPrimaryChange = async (color: string) => {
    setBgPrimary(color);
    applyColors(accentColor, fontColor, color, bgSecondary, statusBarBg, statusBarFg);
    await api.setBgPrimary(color);
  };

  const handleBgSecondaryChange = async (color: string) => {
    setBgSecondary(color);
    applyColors(accentColor, fontColor, bgPrimary, color, statusBarBg, statusBarFg);
    await api.setBgSecondary(color);
  };

  const handleStatusBarBgChange = async (color: string) => {
    setStatusBarBg(color);
    document.documentElement.style.setProperty('--statusbar-bg', color);
    await api.setStatusBarBg(color);
  };

  const handleStatusBarFgChange = async (color: string) => {
    setStatusBarFg(color);
    document.documentElement.style.setProperty('--statusbar-fg', color);
    await api.setStatusBarFg(color);
  };

  const handleResetColors = async () => {
    const defaults = theme === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS;
    setAccentColor(defaults.accentColor);
    setFontColor(defaults.fontColor);
    setBgPrimary(defaults.bgPrimary);
    setBgSecondary(defaults.bgSecondary);
    setStatusBarBg(defaults.statusBarBg);
    setStatusBarFg(defaults.statusBarFg);
    applyColors(defaults.accentColor, defaults.fontColor, defaults.bgPrimary, defaults.bgSecondary, defaults.statusBarBg, defaults.statusBarFg);
    await api.setAccentColor(defaults.accentColor);
    await api.setFontColor(defaults.fontColor);
    await api.setBgPrimary(defaults.bgPrimary);
    await api.setBgSecondary(defaults.bgSecondary);
    await api.setStatusBarBg(defaults.statusBarBg);
    await api.setStatusBarFg(defaults.statusBarFg);
  };

  const handleFontFamilyChange = async (font: string) => {
    setFontFamily(font);
    document.documentElement.style.setProperty('--font-family-ui', `'${font}', system-ui, sans-serif`);
    await api.setFontFamily(font);
  };

  const handleMonoFontFamilyChange = async (font: string) => {
    setMonoFontFamily(font);
    document.documentElement.style.setProperty('--font-family-mono', `'${font}', Consolas, monospace`);
    await api.setMonoFontFamily(font);
  };

  // Filter fonts for better UX
  const uiFonts = systemFonts.filter(f => 
    !f.toLowerCase().includes('emoji') &&
    !f.toLowerCase().includes('symbol') &&
    !f.toLowerCase().includes('webdings') &&
    !f.toLowerCase().includes('wingdings')
  );

  const monoFonts = systemFonts.filter(f =>
    f.toLowerCase().includes('mono') ||
    f.toLowerCase().includes('code') ||
    f.toLowerCase().includes('consola') ||
    f.toLowerCase().includes('courier') ||
    f.toLowerCase().includes('fixed') ||
    f.toLowerCase().includes('terminal') ||
    f.toLowerCase().includes('hack') ||
    f.toLowerCase().includes('fira') ||
    f.toLowerCase().includes('jetbrains') ||
    f.toLowerCase().includes('source code') ||
    f.toLowerCase().includes('roboto mono') ||
    f.toLowerCase().includes('ubuntu mono') ||
    f.toLowerCase().includes('droid sans mono') ||
    f.toLowerCase().includes('dejavu sans mono') ||
    f.toLowerCase().includes('inconsolata') ||
    f.toLowerCase().includes('menlo') ||
    f.toLowerCase().includes('sf mono')
  );

  // Build color definitions for the grid
  const brandColors: ColorDef[] = [
    { id: 'accent-color', label: 'Accent', hint: 'Buttons, links, focus indicators', value: accentColor, onChange: handleAccentChange },
    { id: 'font-color', label: 'Font', hint: 'Primary text and content', value: fontColor, onChange: handleFontColorChange },
  ];

  const backgroundColors: ColorDef[] = [
    { id: 'bg-primary', label: 'Primary', hint: 'Main content area', value: bgPrimary, onChange: handleBgPrimaryChange },
    { id: 'bg-secondary', label: 'Secondary', hint: 'Sidebar & cards', value: bgSecondary, onChange: handleBgSecondaryChange },
  ];

  const statusBarColors: ColorDef[] = [
    { id: 'statusbar-bg', label: 'Background', hint: 'Status bar background', value: statusBarBg, onChange: handleStatusBarBgChange },
    { id: 'statusbar-fg', label: 'Text', hint: 'Status bar text & icons', value: statusBarFg, onChange: handleStatusBarFgChange },
  ];

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading appearance settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>Appearance</h2>
        <p className="settings-page-description">
          Customize how Buddy looks and feels. All changes apply immediately.
        </p>
      </div>

      <div className="settings-page-content">
        {/* Theme Section */}
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Palette size={16} />
              Theme
            </h3>
          </div>
          <div className="theme-selector">
            <button
              className={`theme-option ${theme === 'dark' ? 'selected' : ''}`}
              onClick={() => handleThemeChange('dark')}
            >
              <Moon size={20} />
              <span>Dark</span>
            </button>
            <button
              className={`theme-option ${theme === 'light' ? 'selected' : ''}`}
              onClick={() => handleThemeChange('light')}
            >
              <Sun size={20} />
              <span>Light</span>
            </button>
          </div>
        </div>

        {/* Colors Section — compact grid layout */}
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Palette size={16} />
              Colors
            </h3>
            <button 
              className="settings-btn settings-btn-secondary"
              onClick={handleResetColors}
              title="Reset to theme defaults"
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div className="color-group">
            <h4 className="color-group-label">Brand</h4>
            <div className="color-grid">
              {brandColors.map(c => <ColorPicker key={c.id} {...c} />)}
            </div>
          </div>

          <div className="color-group">
            <h4 className="color-group-label">Backgrounds</h4>
            <div className="color-grid">
              {backgroundColors.map(c => <ColorPicker key={c.id} {...c} />)}
            </div>
          </div>

          <div className="color-group">
            <h4 className="color-group-label">Status Bar</h4>
            <div className="color-grid">
              {statusBarColors.map(c => <ColorPicker key={c.id} {...c} />)}
            </div>
          </div>
        </div>

        {/* Font Section */}
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Type size={16} />
              Fonts
            </h3>
          </div>
          
          <div className="font-grid">
            <div className="font-cell">
              <label htmlFor="ui-font">UI Font</label>
              <select
                id="ui-font"
                className="settings-select"
                value={fontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
                disabled={fontsLoading}
              >
                <option value="Inter">Inter (Default)</option>
                <option value="system-ui">System Default</option>
                {uiFonts.map(font => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
              <div 
                className="font-preview"
                style={{ fontFamily: `'${fontFamily}', system-ui, sans-serif` }}
              >
                The quick brown fox jumps over the lazy dog
              </div>
            </div>

            <div className="font-cell">
              <label htmlFor="mono-font">Monospace Font</label>
              <select
                id="mono-font"
                className="settings-select"
                value={monoFontFamily}
                onChange={(e) => handleMonoFontFamilyChange(e.target.value)}
                disabled={fontsLoading}
              >
                <option value="Cascadia Code">Cascadia Code (Default)</option>
                <option value="Consolas">Consolas</option>
                {monoFonts.filter(f => f !== 'Cascadia Code' && f !== 'Consolas').map(font => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
              <div 
                className="font-preview mono"
                style={{ fontFamily: `'${monoFontFamily}', Consolas, monospace` }}
              >
                const hello = "world"; // 0123456789
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
