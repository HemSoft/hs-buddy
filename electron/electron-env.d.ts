/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
  }
  copilot: {
    execute: (args: {
      prompt: string
      category?: string
      metadata?: unknown
      model?: string
    }) => Promise<{ resultId: string | null; success: boolean; error?: string }>
    cancel: (resultId: string) => Promise<{ success: boolean; error?: string }>
    getActiveCount: () => Promise<number>
  }
}
