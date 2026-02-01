import { useState, useEffect } from 'react';
import { usePRSettings } from '../../hooks/useConfig';
import { RefreshCw, Clock, Calendar, ToggleLeft, ToggleRight } from 'lucide-react';
import './SettingsShared.css';

export function SettingsPullRequests() {
  const { 
    refreshInterval, 
    autoRefresh, 
    recentlyMergedDays, 
    loading, 
    setRefreshInterval, 
    setAutoRefresh,
    setRecentlyMergedDays 
  } = usePRSettings();

  const [localRefreshInterval, setLocalRefreshInterval] = useState(refreshInterval);
  const [localAutoRefresh, setLocalAutoRefresh] = useState(autoRefresh);
  const [localMergedDays, setLocalMergedDays] = useState(recentlyMergedDays);

  useEffect(() => {
    setLocalRefreshInterval(refreshInterval);
    setLocalAutoRefresh(autoRefresh);
    setLocalMergedDays(recentlyMergedDays);
  }, [refreshInterval, autoRefresh, recentlyMergedDays]);

  const handleAutoRefreshToggle = async () => {
    const newValue = !localAutoRefresh;
    setLocalAutoRefresh(newValue);
    await setAutoRefresh(newValue);
  };

  const handleRefreshIntervalChange = async (value: number) => {
    setLocalRefreshInterval(value);
    await setRefreshInterval(value);
  };

  const handleMergedDaysChange = async (value: number) => {
    setLocalMergedDays(value);
    await setRecentlyMergedDays(value);
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <RefreshCw className="spin" size={24} />
          <p>Loading PR settings...</p>
        </div>
      </div>
    );
  }

  const refreshOptions = [1, 5, 10, 15, 30, 60];
  const mergedDaysOptions = [7, 14, 30, 60, 90];

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2>Pull Requests</h2>
        <p className="settings-page-description">
          Configure how pull requests are fetched and displayed.
        </p>
      </div>

      <div className="settings-page-content">
        <div className="settings-section">
          <div className="section-header">
            <h3>
              <RefreshCw size={16} />
              Auto Refresh
            </h3>
          </div>
          <p className="section-description">
            Automatically refresh PR data in the background.
          </p>
          <div className="setting-row">
            <div className="setting-info">
              <label>Enable Auto Refresh</label>
              <p className="setting-hint">
                When enabled, PRs will automatically refresh at the specified interval.
              </p>
            </div>
            <button
              className={`toggle-button ${localAutoRefresh ? 'active' : ''}`}
              onClick={handleAutoRefreshToggle}
              aria-pressed={localAutoRefresh}
            >
              {localAutoRefresh ? (
                <ToggleRight size={32} />
              ) : (
                <ToggleLeft size={32} />
              )}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Clock size={16} />
              Refresh Interval
            </h3>
          </div>
          <p className="section-description">
            How often to refresh PR data (when auto refresh is enabled).
          </p>
          <div className="select-control">
            <select
              value={localRefreshInterval}
              onChange={(e) => handleRefreshIntervalChange(Number(e.target.value))}
              className="settings-select"
            >
              {refreshOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} {minutes === 1 ? 'minute' : 'minutes'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-header">
            <h3>
              <Calendar size={16} />
              Recently Merged
            </h3>
          </div>
          <p className="section-description">
            How far back to look for recently merged PRs.
          </p>
          <div className="select-control">
            <select
              value={localMergedDays}
              onChange={(e) => handleMergedDaysChange(Number(e.target.value))}
              className="settings-select"
            >
              {mergedDaysOptions.map((days) => (
                <option key={days} value={days}>
                  Last {days} days
                </option>
              ))}
            </select>
          </div>
          <p className="hint">
            Increasing this value will show more PRs but may take longer to load.
          </p>
        </div>
      </div>
    </div>
  );
}
