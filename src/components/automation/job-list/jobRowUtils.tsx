import { Brain, Terminal, Zap } from 'lucide-react'

export function getWorkerIcon(workerType: 'exec' | 'ai' | 'skill', size = 16) {
  switch (workerType) {
    case 'exec':
      return <Terminal size={size} className="worker-icon worker-exec" />
    case 'ai':
      return <Brain size={size} className="worker-icon worker-ai" />
    case 'skill':
      return <Zap size={size} className="worker-icon worker-skill" />
  }
}
