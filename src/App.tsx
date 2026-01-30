import { useState } from 'react'
import './App.css'

function App() {
  const [message] = useState('Welcome to hs-buddy')

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>hs-buddy</h1>
        </div>
        <div className="sidebar-content">
          <div className="tree-placeholder">
            <p>Tree view coming soon...</p>
            <ul>
              <li>Pull Requests</li>
              <li>Skills</li>
              <li>Tasks</li>
              <li>More to come...</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="main-content">
        <div className="content-header">
          <h2>{message}</h2>
        </div>
        <div className="content-body">
          <p>Your universal productivity companion</p>
          <p className="subtitle">
            Built on the <code>hs-conductor</code> architecture
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
