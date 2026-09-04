import { bool, json, type Db, type Row } from '../lib/db.ts'
import { id } from '../lib/ids.ts'
import { minorDigits } from '../lib/money.ts'

export type ShippingOption = {
  id: string
  regionId: string
  name: string
  amountCents: number
  freeAboveCents: number | null
  position: number
}

export type Region = {
  id: string
  storeId: string
  name: string
  currency: string
  locale: string
  exchangeRate: number
  countries: string[]
  taxRate: number
  isDefault: boolean
  shipping: ShippingOption[]
}

function rowToOption(row: Row): ShippingOption {
  return {
    id: row.id as string,
    regionId: row.region_id as string,
    name: row.name as string,
    amountCents: row.amount_cents as number,
    freeAboveCents: (row.free_above_cents as number | null) ?? null,
    position: row.position as number,
  }
}

export function listRegions(db: Db, storeId: string): Region[] {
  return db.all('SELECT * FROM regions WHERE store_id = ? ORDER BY is_default DESC, name', storeId).map((row) => ({
    id: row.id as string,
    storeId,
    name: row.name as string,
    currency: row.currency as string,
    locale: (row.locale as string) || 'en-US',
    exchangeRate: Number(row.exchange_rate ?? 1),
    countries: json(row.countries, [] as string[]),
    taxRate: row.tax_rate as number,
    isDefault: bool(row.is_default),
    shipping: db.all('SELECT * FROM shipping_options WHERE region_id = ? ORDER BY position', row.id).map(rowToOption),
  }))
}

export function defaultRegion(db: Db, storeId: string): Region | null {
  const regions = listRegions(db, storeId)
  return regions.find((region) => region.isDefault) ?? regions[0] ?? null
}

export function getRegion(db: Db, storeId: string, regionId: string): Region | null {
  return listRegions(db, storeId).find((region) => region.id === regionId) ?? null
}

export function createRegion(
  db: Db,
  storeId: string,
  input: { name: string; currency: string; countries: string[]; locale?: string; exchangeRate?: number; taxRate?: number; isDefault?: boolean },
): Region {
  const regionId = id('reg')
  db.tx(() => {
    if (input.isDefault) db.run('UPDATE regions SET is_default = 0 WHERE store_id = ?', storeId)
    const existing = db.one<{ c: number }>('SELECT COUNT(*) c FROM regions WHERE store_id = ?', storeId)?.c ?? 0
    db.insert('regions', {
      id: regionId,
      store_id: storeId,
      name: input.name,
      currency: input.currency.toUpperCase(),
      locale: input.locale ?? 'en-US',
      exchange_rate: Math.max(0.000001, input.exchangeRate ?? 1),
      countries: input.countries,
      tax_rate: input.taxRate ?? 0,
      is_default: input.isDefault ?? existing === 0,
    })
  })
  return getRegion(db, storeId, regionId) as Region
}

export function updateRegion(
  db: Db,
  storeId: string,
  regionId: string,
  input: { name?: string; currency?: string; countries?: string[]; locale?: string; exchangeRate?: number; taxRate?: number; isDefault?: boolean },
): Region {
  const region = getRegion(db, storeId, regionId)
  if (!region) throw new Error('No such region')
  if (input.isDefault) db.run('UPDATE regions SET is_default = 0 WHERE store_id = ?', storeId)
  db.update('regions', regionId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
    ...(input.countries !== undefined ? { countries: input.countries } : {}),
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.exchangeRate !== undefined ? { exchange_rate: Math.max(0.000001, input.exchangeRate) } : {}),
    ...(input.taxRate !== undefined ? { tax_rate: input.taxRate } : {}),
    ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}),
  })
  return getRegion(db, storeId, regionId) as Region
}

export function regionForCountry(db: Db, storeId: string, country: string): Region | null {
  const normalized = country.trim().toUpperCase()
  return listRegions(db, storeId).find((region) => region.countries.map((entry) => entry.toUpperCase()).includes(normalized)) ?? defaultRegion(db, storeId)
}

export function convertCents(cents: number, region: Region | null | undefined, sourceCurrency = 'USD'): number {
  if (!region) return cents
  const sourceScale = 10 ** minorDigits(sourceCurrency)
  const targetScale = 10 ** minorDigits(region.currency)
  return Math.round((cents / sourceScale) * region.exchangeRate * targetScale)
}

/** Reverse a charged regional amount into the store's base minor unit. */
export function toBaseCents(cents: number, region: Region | null | undefined, baseCurrency = 'USD'): number {
  if (!region) return cents
  const targetScale = 10 ** minorDigits(region.currency)
  const baseScale = 10 ** minorDigits(baseCurrency)
  return Math.round((cents / targetScale / region.exchangeRate) * baseScale)
}

export function addShippingOption(
  db: Db,
  regionId: string,
  input: { name: string; amountCents: number; freeAboveCents?: number | null },
): ShippingOption {
  const optionId = id('so')
  const count = db.one<{ c: number }>('SELECT COUNT(*) c FROM shipping_options WHERE region_id = ?', regionId)?.c ?? 0
  db.insert('shipping_options', {
    id: optionId,
    region_id: regionId,
    name: input.name,
    amount_cents: input.amountCents,
    free_above_cents: input.freeAboveCents ?? null,
    position: count,
  })
  return rowToOption(db.one('SELECT * FROM shipping_options WHERE id = ?', optionId) as Row)
}

/** Per-region free-shipping thresholds: the cheapest option that clears wins. */
export function rateFor(region: Region | null, subtotalCents: number, freeShipping: boolean, optionId?: string): { name: string; amountCents: number; gapCents: number | null; optionId: string } {
  if (!region || !region.shipping.length) {
    return { name: 'Standard', amountCents: 0, gapCents: null, optionId: '' }
  }
  const option = (optionId ? region.shipping.find((entry) => entry.id === optionId) : undefined) ?? (region.shipping[0] as ShippingOption)
  // Free shipping earned by a promotion applies to the standard rate; a
  // customer who picks express still pays the difference.
  if (freeShipping && option.position === 0) return { name: `${option.name} (free)`, amountCents: 0, gapCents: null, optionId: option.id }
  const threshold = option.freeAboveCents
  if (threshold !== null && subtotalCents >= threshold) {
    return { name: `${option.name} (free over threshold)`, amountCents: 0, gapCents: null, optionId: option.id }
  }
  return {
    name: option.name,
    amountCents: option.amountCents,
    gapCents: threshold === null ? null : Math.max(0, threshold - subtotalCents),
    optionId: option.id,
  }
}

export function seedDefaultRegion(db: Db, storeId: string, currency: string): Region {
  const region = createRegion(db, storeId, {
    name: 'United States',
    currency,
    locale: 'en-US',
    exchangeRate: 1,
    countries: ['US'],
    taxRate: 0,
    isDefault: true,
  })
  addShippingOption(db, region.id, { name: 'Standard shipping', amountCents: 900, freeAboveCents: 20000 })
  addShippingOption(db, region.id, { name: 'Express (2 day)', amountCents: 2400, freeAboveCents: null })
  return getRegion(db, storeId, region.id) as Region
}
