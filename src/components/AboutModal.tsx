import { X, Github, Heart, Users } from 'lucide-react'
import './AboutModal.css'

interface AboutModalProps {
  onClose: () => void
}

export function AboutModal({ onClose }: AboutModalProps) {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const openGitHub = () => {
    window.shell.openExternal('https://github.com/HemSoft/hs-buddy')
  }

  return (
    <div className="about-modal-overlay" onClick={handleOverlayClick}>
      <div className="about-modal">
        <button className="about-close-button" onClick={onClose} title="Close">
          <X size={18} />
        </button>

        <div className="about-content">
          {/* App Icon */}
          <div className="about-icon">
            <Users size={48} strokeWidth={2.5} />
          </div>

          {/* App Name */}
          <h1 className="about-app-name">Buddy</h1>

          {/* Version Badge */}
          <div className="about-version-badge">Version 0.1.10</div>

          {/* Tagline */}
          <div className="about-tagline">
            <span className="about-tagline-emoji">🤝</span>
            <span>Your Universal Productivity Companion</span>
          </div>

          {/* Description */}
          <p className="about-description">
            A powerful desktop app for managing GitHub PRs, 
            automating workflows, and boosting productivity 
            with the HemSoft skills infrastructure.
          </p>

          {/* Tech Stack */}
          <div className="about-tech-stack">
            <div className="tech-item">
              <span className="tech-label">RUNTIME</span>
              <span className="tech-value">Electron 30</span>
            </div>
            <div className="tech-item">
              <span className="tech-label">FRAMEWORK</span>
              <span className="tech-value">React 18</span>
            </div>
            <div className="tech-item">
              <span className="tech-label">BUILD</span>
              <span className="tech-value">Vite + Bun</span>
            </div>
          </div>

          {/* GitHub Link */}
          <button className="about-github-link" onClick={openGitHub}>
            <Github size={16} />
            <span>View on GitHub</span>
          </button>

          {/* Footer Branding */}
          <div className="about-footer">
            <span>Made with</span>
            <Heart size={14} className="about-heart" />
            <span>by HemSoft Developments</span>
          </div>
        </div>
      </div>
    </div>
  )
}
