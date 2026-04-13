import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  DollarSign,
} from 'lucide-react'
import { useState } from 'react'
import { SectionHeading } from './DashboardPrimitives'
import { useFinance } from '../../hooks/useFinance'
import type { QuoteData } from '../../hooks/useFinance'
import './FinanceCard.css'

const EXPANDED_KEY = 'finance:expanded'

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) !== 'false'
  } catch {
    return true
  }
}

function formatPrice(price: number): string {
  if (price == null || isNaN(price)) return '—'
  return price >= 1000
    ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function QuoteRow({ quote, onRemove }: { quote: QuoteData; onRemove?: (symbol: string) => void }) {
  const change = quote.change ?? 0
  const changePercent = quote.changePercent ?? 0
  const positive = change >= 0

  return (
    <div className="finance-quote-row">
      <div className="finance-quote-info">
        <span className="finance-quote-symbol">{quote.symbol}</span>
        <span className="finance-quote-name">{quote.name}</span>
      </div>
      <div className="finance-quote-price-col">
        <span className="finance-quote-price">{formatPrice(quote.price)}</span>
        <span className={`finance-quote-change ${positive ? 'finance-up' : 'finance-down'}`}>
          {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>
            {positive ? '+' : ''}{change.toFixed(2)} ({positive ? '+' : ''}{changePercent.toFixed(2)}%)
          </span>
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

export function FinanceCard() {
  const { quotes, loading, error, watchlist, refresh, addSymbol, removeSymbol } = useFinance()
  const [expanded, setExpanded] = useState(readExpanded)
  const [addInput, setAddInput] = useState('')

  const toggleExpanded = () => {
    setExpanded(prev => {
      const next = !prev
      try { localStorage.setItem(EXPANDED_KEY, String(next)) } catch { /* noop */ }
      return next
    })
  }

  const handleAdd = () => {
    if (addInput.trim()) {
      addSymbol(addInput.trim())
      setAddInput('')
    }
  }

  // Build a quick summary for collapsed view
  const topQuotes = quotes.slice(0, 3)

  return (
    <section
      className="welcome-section welcome-section-finance"
      aria-label="Finance overview"
    >
      <div className="finance-header-row">
        <SectionHeading
          kicker="Markets"
          title="Finance"
          caption={`${watchlist.length} symbol${watchlist.length !== 1 ? 's' : ''} tracked`}
        />
        <button
          type="button"
          className="weather-collapse-btn"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Collapsed summary */}
      {!expanded && quotes.length > 0 && (
        <div className="finance-collapsed-summary">
          {topQuotes.map(q => {
            const qChange = q.change ?? 0
            const qPct = q.changePercent ?? 0
            const positive = qChange >= 0
            return (
              <div key={q.symbol} className="finance-collapsed-item">
                <span className="finance-collapsed-symbol">{q.name}</span>
                <span className={`finance-collapsed-change ${positive ? 'finance-up' : 'finance-down'}`}>
                  {positive ? '▲' : '▼'} {Math.abs(qPct).toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
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
                <QuoteRow key={q.symbol} quote={q} onRemove={removeSymbol} />
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
                onChange={e => setAddInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                aria-label="Add ticker symbol"
              />
            </div>
            <button
              type="button"
              className="welcome-usage-btn"
              onClick={handleAdd}
              disabled={!addInput.trim()}
              title="Add symbol"
            >
              <Plus size={14} />
              <span>Add</span>
            </button>
          </div>

          <div className="weather-actions">
            <button
              type="button"
              className="welcome-usage-btn"
              onClick={refresh}
              disabled={loading}
              title="Refresh market data"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </>
      )}
    </section>
  )
}
