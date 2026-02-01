import { useState, useEffect } from 'react';
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
  bgPrimary: '#1e1e1e',
  bgSecondary: '#252526',
};

const LIGHT_DEFAULTS = {
  accentColor: '#0078d4',
  bgPrimary: '#ffffff',
  bgSecondary: '#f3f3f3',
};

export function SettingsAppearance() {
  const { config, loading, api } = useConfig();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [accentColor, setAccentColor] = useState('#0e639c');
  const [bgPrimary, setBgPrimary] = useState('#1e1e1e');
  const [bgSecondary, setBgSecondary] = useState('#252526');
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
      setBgPrimary(config.ui.bgPrimary || '#1e1e1e');
      setBgSecondary(config.ui.bgSecondary || '#252526');
      setFontFamily(config.ui.fontFamily || 'Inter');
      setMonoFontFamily(config.ui.monoFontFamily || 'Cascadia Code');
    }
  }, [config]);

  // Apply colors to CSS variables
  const applyColors = (accent: string, primary: string, secondary: string) => {
    const root = document.documentElement;
    root.style.setProperty('--accent-primary', accent);
    root.style.setProperty('--accent-primary-hover', lightenColor(accent, 15));
    root.style.setProperty('--border-focus', accent);
    root.style.setProperty('--bg-primary', primary);
    root.style.setProperty('--panel-bg', primary);
    root.style.setProperty('--input-bg', primary);
    root.style.setProperty('--bg-secondary', secondary);
    root.style.setProperty('--sidebar-bg', secondary);
  };

  const handleThemeChange = async (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Reset colors to theme defaults when switching themes
    const defaults = newTheme === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS;
    setAccentColor(defaults.accentColor);
    setBgPrimary(defaults.bgPrimary);
    setBgSecondary(defaults.bgSecondary);
    
    // Clear inline styles so CSS variables take effect
    const root = document.documentElement;
    root.style.removeProperty('--accent-primary');
    root.style.removeProperty('--accent-primary-hover');
    root.style.removeProperty('--border-focus');
    root.style.removeProperty('--bg-primary');
    root.style.removeProperty('--panel-bg');
    root.style.removeProperty('--input-bg');
    root.style.removeProperty('--bg-secondary');
    root.style.removeProperty('--sidebar-bg');
    
    await api.setTheme(newTheme);
    await api.setAccentColor(defaults.accentColor);
    await api.setBgPrimary(defaults.bgPrimary);
    await api.setBgSecondary(defaults.bgSecondary);
  };

  const handleAccentChange = async (color: string) => {
    setAccentColor(color);
    applyColors(color, bgPrimary, bgSecondary);
    await api.setAccentColor(color);
  };

  const handleBgPrimaryChange = async (color: string) => {
    setBgPrimary(color);
    applyColors(accentColor, color, bgSecondary);
    await api.setBgPrimary(color);
  };

  const handleBgSecondaryChange = async (color: string) => {
    setBgSecondary(color);
    applyColors(accentColor, bgPrimary, color);
    await api.setBgSecondary(color);
  };

  const handleResetColors = async () => {
    const defaults = theme === 'dark' ? DARK_DEFAULTS : LIGHT_DEFAULTS;
    setAccentColor(defaults.accentColor);
    setBgPrimary(defaults.bgPrimary);
    setBgSecondary(defaults.bgSecondary);
    applyColors(defaults.accentColor, defaults.bgPrimary, defaults.bgSecondary);
    await api.setAccentColor(defaults.accentColor);
    await api.setBgPrimary(defaults.bgPrimary);
    await api.setBgSecondary(defaults.bgSecondary);
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
          Customize how Buddy looks and feels.
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
          <p className="section-description">
            Choose your preferred color theme.
          </p>
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

        {/* Colors Section */}
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
          <p className="section-description">
            Customize the accent and background colors.
          </p>
          
          <div className="color-settings">
            <div className="color-setting">
              <label htmlFor="accent-color">Accent Color</label>
              <div className="color-picker-row">
                <input
                  type="color"
                  id="accent-color"
                  className="color-picker"
                  value={accentColor}
                  onChange={(e) => handleAccentChange(e.target.value)}
                />
                <input
                  type="text"
                  className="color-hex-input"
                  value={accentColor}
                  onChange={(e) => {
                    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                      handleAccentChange(e.target.value);
                    }
                  }}
                  placeholder="#0e639c"
                />
              </div>
              <p className="color-hint">Used for buttons, links, and focus indicators</p>
            </div>

            <div className="color-setting">
              <label htmlFor="bg-primary">Primary Background</label>
              <div className="color-picker-row">
                <input
                  type="color"
                  id="bg-primary"
                  className="color-picker"
                  value={bgPrimary}
                  onChange={(e) => handleBgPrimaryChange(e.target.value)}
                />
                <input
                  type="text"
                  className="color-hex-input"
                  value={bgPrimary}
                  onChange={(e) => {
                    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                      handleBgPrimaryChange(e.target.value);
                    }
                  }}
                  placeholder="#1e1e1e"
                />
              </div>
              <p className="color-hint">Main content area and panels</p>
            </div>

            <div className="color-setting">
              <label htmlFor="bg-secondary">Secondary Background</label>
              <div className="color-picker-row">
                <input
                  type="color"
                  id="bg-secondary"
                  className="color-picker"
                  value={bgSecondary}
                  onChange={(e) => handleBgSecondaryChange(e.target.value)}
                />
                <input
                  type="text"
                  className="color-hex-input"
                  value={bgSecondary}
                  onChange={(e) => {
                    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                      handleBgSecondaryChange(e.target.value);
                    }
                  }}
                  placeholder="#252526"
                />
              </div>
              <p className="color-hint">Sidebar and secondary surfaces</p>
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
          <p className="section-description">
            Customize the fonts used in the interface.
          </p>
          
          <div className="font-settings">
            <div className="font-setting">
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

            <div className="font-setting">
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

        <p className="hint">All changes are applied immediately.</p>
      </div>
    </div>
  );
}
