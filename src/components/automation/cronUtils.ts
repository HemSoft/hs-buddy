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

export function buildCronExpression(
  { frequency, minute, hour, dayOfMonth, selectedDays }: CronState,
  rawValue: string
) {
  switch (frequency) {
    case 'minute':
      return '* * * * *'
    case 'hourly':
      return `${minute} * * * *`
    case 'daily':
      return `${minute} ${hour} * * *`
    case 'weekly':
      return `${minute} ${hour} * * ${[...selectedDays].sort().join(',')}`
    case 'monthly':
      return `${minute} ${hour} ${dayOfMonth} * *`
    case 'custom':
      return rawValue
    default:
      return '0 * * * *'
  }
}

export type { CronState }
