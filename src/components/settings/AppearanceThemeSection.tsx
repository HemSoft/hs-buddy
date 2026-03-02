import { Moon, Palette, Sun } from 'lucide-react';

interface AppearanceThemeSectionProps {
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => Promise<void>;
}

export function AppearanceThemeSection({ theme, onThemeChange }: AppearanceThemeSectionProps) {
  return (
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
          onClick={() => onThemeChange('dark')}
        >
          <Moon size={20} />
          <span>Dark</span>
        </button>
        <button
          className={`theme-option ${theme === 'light' ? 'selected' : ''}`}
          onClick={() => onThemeChange('light')}
        >
          <Sun size={20} />
          <span>Light</span>
        </button>
      </div>
    </div>
  );
}
