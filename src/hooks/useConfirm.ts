import { useCallback, useState } from 'react'

interface ConfirmOptions {
  message: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
}

interface ConfirmState extends ConfirmOptions {
  resolve: (result: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ ...options, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state?.resolve(true)
    setState(null)
  }, [state])

  const handleCancel = useCallback(() => {
    state?.resolve(false)
    setState(null)
  }, [state])

  return {
    confirm,
    confirmDialog: state
      ? {
          message: state.message,
          description: state.description,
          confirmLabel: state.confirmLabel,
          cancelLabel: state.cancelLabel,
          variant: state.variant,
          onConfirm: handleConfirm,
          onCancel: handleCancel,
        }
      : null,
  }
}
