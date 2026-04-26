type Frequency = 'minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

interface CronState {
  frequency: Frequency
  minute: number
  hour: number
  dayOfMonth: number
  selectedDays: number[]
}

type CronSignature = 'v***' | 'vv**' | 'vv*v' | 'vvv*'

const DEFAULT_CRON_STATE: CronState = {
  frequency: 'hourly',
  minute: 0,
  hour: 9,
  dayOfMonth: 1,
  selectedDays: [1],
}

const CRON_SIGNATURE_RESOLVERS: Record<
  CronSignature,
  (min: string, hr: string, dom: string, dow: string) => Partial<CronState>
> = {
  'v***': min => ({ frequency: 'hourly', minute: parseInt(min) || 0 }),
  'vv**': (min, hr) => ({
    frequency: 'daily',
    minute: parseInt(min) || 0,
    hour: parseInt(hr) || 9,
  }),
  'vv*v': (min, hr, _dom, dow) => {
    const days = dow
      .split(',')
      .map(day => parseInt(day))
      .filter(day => !isNaN(day))
    return {
      frequency: 'weekly',
      minute: parseInt(min) || 0,
      hour: parseInt(hr) || 9,
      selectedDays: days.length > 0 ? days : [1],
    }
  },
  'vvv*': (min, hr, dom) => ({
    frequency: 'monthly',
    minute: parseInt(min) || 0,
    hour: parseInt(hr) || 9,
    dayOfMonth: parseInt(dom) || 1,
  }),
}

function isCronSignature(signature: string): signature is CronSignature {
  return signature in CRON_SIGNATURE_RESOLVERS
}

export function parseCronValue(value: string): CronState {
  const parts = value.split(' ')
  if (parts.length !== 5) {
    return { ...DEFAULT_CRON_STATE, frequency: 'custom' }
  }

  const [min, hr, dom, , dow] = parts

  if (value === '* * * * *') {
    return { ...DEFAULT_CRON_STATE, frequency: 'minute' }
  }

  const signature = [min, hr, dom, dow].map(part => (part === '*' ? '*' : 'v')).join('')
  if (!isCronSignature(signature)) {
    return { ...DEFAULT_CRON_STATE, frequency: 'custom' }
  }

  return {
    ...DEFAULT_CRON_STATE,
    ...CRON_SIGNATURE_RESOLVERS[signature](min, hr, dom, dow),
  }
}

const CRON_EXPRESSION_BUILDERS: Record<Frequency, (state: CronState, rawValue: string) => string> =
  {
    minute: () => '* * * * *',
    hourly: ({ minute }) => `${minute} * * * *`,
    daily: ({ minute, hour }) => `${minute} ${hour} * * *`,
    weekly: ({ minute, hour, selectedDays }) =>
      `${minute} ${hour} * * ${[...selectedDays].sort().join(',')}`,
    monthly: ({ minute, hour, dayOfMonth }) => `${minute} ${hour} ${dayOfMonth} * *`,
    custom: (_state, rawValue) => rawValue,
  }

export function buildCronExpression(state: CronState, rawValue: string) {
  const { frequency } = state
  const builder = Object.prototype.hasOwnProperty.call(CRON_EXPRESSION_BUILDERS, frequency)
    ? CRON_EXPRESSION_BUILDERS[frequency]
    : null
  /* v8 ignore start */
  return builder ? builder(state, rawValue) : '0 * * * *'
  /* v8 ignore stop */
}

export type { CronState }
