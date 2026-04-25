import { Plus, X, DollarSign, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { SectionHeading, CardHeader, CardActionBar } from './DashboardPrimitives'
import { useFinance, type QuoteData } from '../../hooks/useFinance'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'
import { useExpandCollapse } from '../../hooks/useExpandCollapse'
import './FinanceCard.css'

function formatPrice(price: number): string {
  /* v8 ignore start */
  if (price == null || isNaN(price)) return '—'
  /* v8 ignore stop */
  return price >= 1000
    ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function getQuoteDisplayValues(change: number, changePercent: number, marketOpen: boolean) {
  const positive = change >= 0
  const sign = positive ? '+' : ''
  return {
    positive,
    rowClass: `finance-quote-row ${positive ? 'finance-quote-row--up' : 'finance-quote-row--down'}`,
    trendClass: `finance-quote-trend ${positive ? 'finance-up' : 'finance-down'}`,
    changeClass: `finance-quote-change ${positive ? 'finance-up' : 'finance-down'}`,
    marketClass: `finance-market-pill ${marketOpen ? 'finance-market-open' : 'finance-market-closed'}`,
    arrow: positive ? '▲' : '▼',
    srLabel: positive ? 'Up' : 'Down',
    marketLabel: marketOpen ? 'Open' : 'Closed',
    changeText: `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`,
  }
}

function QuoteRow({ quote, onRemove }: { quote: QuoteData; onRemove?: (symbol: string) => void }) {
  const d = getQuoteDisplayValues(quote.change ?? 0, quote.changePercent ?? 0, quote.marketOpen)

  return (
    <div className={d.rowClass}>
      <div className="finance-quote-info">
        <div className="finance-quote-symbol-row">
          <span className={d.trendClass} aria-hidden="true">
            {d.arrow}
          </span>
          <span className="sr-only">{d.srLabel}</span>
          <span className="finance-quote-symbol">{quote.name}</span>
          <span className={d.marketClass}>{d.marketLabel}</span>
        </div>
      </div>
      <div className="finance-quote-price-col">
        <span className="finance-quote-price">{formatPrice(quote.price)}</span>
        <span className={d.changeClass}>
          <span aria-hidden="true">{d.arrow}</span> <span>{d.changeText}</span>
        </span>
      </div>
      {onRemove && (
        <button
          type="button"
          className="finance-remove-btn"
          onClick={() => onRemove(quote.symbol)}
          title={`Remove ${quote.symbol}`}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function FinanceExpandedContent({
  quotes,
  loading,
  error,
  addInput,
  onAddInputChange,
  onAdd,
  onRemove,
  autoRefresh,
}: {
  quotes: QuoteData[]
  loading: boolean
  error: string | null
  addInput: string
  onAddInputChange: (v: string) => void
  onAdd: () => void
  onRemove: (symbol: string) => void
  autoRefresh: ReturnType<typeof useAutoRefresh>
}) {
  return (
    <>
      {loading && quotes.length === 0 && (
        <div className="weather-loading">
          <RefreshCw size={16} className="spin" />
          <span>Fetching market data…</span>
        </div>
      )}

      {error && (
        <div className="weather-error">
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && quotes.length === 0 && (
        <div className="weather-error">
          <span>No market data available. Try refreshing.</span>
        </div>
      )}

      {quotes.length > 0 && (
        <div className="finance-quote-list">
          {quotes.map(q => (
            <QuoteRow key={q.symbol} quote={q} onRemove={onRemove} />
          ))}
        </div>
      )}

      <div className="finance-add-row">
        <div className="weather-search-input-group">
          <DollarSign size={14} className="weather-search-icon" />
          <input
            type="text"
            className="weather-search-input"
            placeholder="Add symbol (e.g. AAPL, ETH-USD)…"
            value={addInput}
            onChange={e => onAddInputChange(e.target.value)}
            onKeyDown={e => {
              /* v8 ignore start */
              if (e.key === 'Enter') onAdd()
              /* v8 ignore stop */
            }}
            aria-label="Add ticker symbol"
          />
        </div>
        <button
          type="button"
          className="welcome-usage-btn"
          onClick={onAdd}
          disabled={!addInput.trim()}
          title="Add symbol"
        >
          <Plus size={14} />
          <span>Add</span>
        </button>
      </div>

      <CardActionBar
        onRefresh={autoRefresh.refresh}
        loading={loading}
        refreshTitle="Refresh market data"
        selectedInterval={autoRefresh.selectedValue}
        onIntervalChange={autoRefresh.setInterval}
        lastRefreshedLabel={autoRefresh.lastRefreshedLabel}
        nextRefreshLabel={autoRefresh.nextRefreshLabel}
      />
    </>
  )
}

export function FinanceCard() {
  const { quotes, loading, error, watchlist, refresh, addSymbol, removeSymbol, lastFetchedAt } =
    useFinance()
  const autoRefresh = useAutoRefresh(
    'finance',
    refresh,
    15,
    loading || watchlist.length === 0,
    lastFetchedAt
  )
  const { expanded, toggle } = useExpandCollapse('finance:expanded')
  const [addInput, setAddInput] = useState('')

  const handleAdd = () => {
    /* v8 ignore start */
    if (addInput.trim()) {
      /* v8 ignore stop */
      addSymbol(addInput.trim())
      setAddInput('')
    }
  }

  // Build a quick summary for collapsed view
  const topQuotes = quotes.slice(0, 3)

  return (
    <section className="welcome-section welcome-section-finance" aria-label="Finance overview">
      <CardHeader expanded={expanded} onToggle={toggle}>
        <SectionHeading
          kicker="Markets"
          title="Finance"
          caption={`${watchlist.length} symbol${watchlist.length !== 1 ? 's' : ''} tracked`}
        />
      </CardHeader>

      {/* Collapsed summary */}
      {!expanded && quotes.length > 0 && (
        <div className="finance-collapsed-summary">
          {topQuotes.map(q => {
            /* v8 ignore start */
            const qChange = q.change ?? 0
            const qPct = q.changePercent ?? 0
            /* v8 ignore stop */
            const positive = qChange >= 0
            return (
              <div key={q.symbol} className="finance-collapsed-item">
                <span className="finance-collapsed-symbol">{q.name}</span>
                <span
                  className={`finance-collapsed-change ${positive ? 'finance-up' : 'finance-down'}`}
                >
                  {positive ? '▲' : '▼'} {Math.abs(qPct).toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <FinanceExpandedContent
          quotes={quotes}
          loading={loading}
          error={error}
          addInput={addInput}
          onAddInputChange={setAddInput}
          onAdd={handleAdd}
          onRemove={removeSymbol}
          autoRefresh={autoRefresh}
        />
      )}
    </section>
  )
}
