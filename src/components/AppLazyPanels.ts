import { lazy } from 'react'

export const assistantPanelLoader = () =>
  import('./AssistantPanel').then(module => ({ default: module.AssistantPanel }))

export const LazyAssistantPanel = lazy(assistantPanelLoader)
