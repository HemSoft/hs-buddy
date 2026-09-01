export function LazyLoadErrorFallback({ message }: { message: string }) {
  return (
    <div className="content-placeholder">
      <div className="content-header">
        <h2>Something went wrong</h2>
      </div>
      <div className="content-body">
        <p>{message}</p>
        <p>Reload Buddy to retry downloading this feature.</p>
        <button
          type="button"
          onClick={() => {
            window.location.reload()
          }}
        >
          Reload Buddy
        </button>
      </div>
    </div>
  )
}
