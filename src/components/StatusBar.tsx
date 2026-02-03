import { useState, useEffect } from 'react';
import { GitPullRequest, Calendar, Clock, Bot, Zap } from 'lucide-react';
import './StatusBar.css';

interface StatusBarProps {
  prCount?: number;
  scheduleCount?: number;
  jobCount?: number;
}

export function StatusBar({ prCount = 0, scheduleCount = 0, jobCount = 0 }: StatusBarProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {/* Pull Requests */}
        <div className="status-item" data-tooltip="Open Pull Requests">
          <span className="status-icon"><GitPullRequest size={12} /></span>
          <span className="status-text">{prCount} PRs</span>
        </div>
        
        <div className="status-divider" />
        
        {/* Schedules */}
        <div className="status-item" data-tooltip="Active Schedules">
          <span className="status-icon"><Calendar size={12} /></span>
          <span className="status-text">{scheduleCount} schedules</span>
        </div>
        
        <div className="status-divider" />
        
        {/* Jobs */}
        <div className="status-item" data-tooltip="Configured Jobs">
          <span className="status-icon"><Zap size={12} /></span>
          <span className="status-text">{jobCount} jobs</span>
        </div>
      </div>
      
      <div className="status-bar-center">
        {/* Buddy branding */}
        <div className="status-item status-item-brand" data-tooltip="hs-buddy">
          <span className="status-icon"><Bot size={12} /></span>
          <span className="status-text">Buddy</span>
        </div>
      </div>
      
      <div className="status-bar-right">
        {/* Date */}
        <div className="status-item" data-tooltip="Current Date">
          <span className="status-icon"><Calendar size={12} /></span>
          <span className="status-text">{formatDate(currentTime)}</span>
        </div>
        <div className="status-divider" />
        {/* Time */}
        <div className="status-item status-item-time" data-tooltip="Current Time">
          <span className="status-icon"><Clock size={12} /></span>
          <span className="status-text">{formatTime(currentTime)}</span>
        </div>
      </div>
    </div>
  );
}
