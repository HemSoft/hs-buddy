import { useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { TreeView } from './components/TreeView'
import './App.css'

function App() {
  const [message] = useState('Welcome to hs-buddy')

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <div className="sidebar">
          <div className="sidebar-header">
            <h1>hs-buddy</h1>
          </div>
          <div className="sidebar-content">
            <TreeView />
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
    </div>
  )
}

export default App
