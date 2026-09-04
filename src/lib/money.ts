/** Every amount in the platform is an integer of the currency's minor unit. */
export type Cents = number

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK'])

export function format(cents: Cents, currency = 'USD'): string {
  const minor = ZERO_DECIMAL.has(currency) ? 0 : 2
  const value = cents / 10 ** minor
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: minor,
      maximumFractionDigits: minor,
    }).format(value)
  } catch {
    return `${value.toFixed(minor)} ${currency}`
  }
}

export function percentOf(cents: Cents, percent: number): Cents {
  return Math.round((cents * percent) / 100)
}

/** Estimate Stripe-style card processing; personal mode adds no platform fee. */
export function cardFee(cents: Cents, rate: number): Cents {
  return Math.round(cents * rate) + 30
}
