"use client";
import type { Address } from "@kiln/shared";
import { COUNTRIES, countryByCode, dialCodeFor } from "@/lib/countries";
import { Input, Select } from "@/components/ui/Field";

export type AddressErrors = Partial<Record<keyof Address, string>>;

export function validateAddress(a: Address): AddressErrors {
  const e: AddressErrors = {};
  if (!a.firstName.trim()) e.firstName = "Required";
  if (!a.lastName.trim()) e.lastName = "Required";
  if (!a.line1.trim()) e.line1 = "Street address is required";
  if (!a.city.trim()) e.city = "Required";
  if (!a.postalCode.trim()) e.postalCode = "Required";
  if (!a.country) e.country = "Required";
  return e;
}

/** Address fields with country-aware labels and a phone prefix auto-detected from the selected country. */
export function AddressForm({ value, onChange, errors = {}, idPrefix = "addr", allowedCountries }: { value: Address; onChange: (a: Address) => void; errors?: AddressErrors; idPrefix?: string; allowedCountries?: string[] }) {
  const set = (k: keyof Address, v: string) => onChange({ ...value, [k]: v });
  const country = countryByCode(value.country);
  const dial = dialCodeFor(value.country);
  const countries = allowedCountries?.length ? COUNTRIES.filter((c) => allowedCountries.includes(c.code)) : COUNTRIES;
  const list = countries.length ? countries : COUNTRIES;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Input id={`${idPrefix}-first`} label="First name" autoComplete="given-name" value={value.firstName} onChange={(e) => set("firstName", e.target.value)} error={errors.firstName} required />
      <Input id={`${idPrefix}-last`} label="Last name" autoComplete="family-name" value={value.lastName} onChange={(e) => set("lastName", e.target.value)} error={errors.lastName} required />
      <Select id={`${idPrefix}-country`} label="Country" autoComplete="country" className="sm:col-span-2" value={value.country} onChange={(e) => set("country", e.target.value)} error={errors.country}>
        {list.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        {!list.some((c) => c.code === value.country) && value.country && <option value={value.country}>{value.country}</option>}
      </Select>
      <Input id={`${idPrefix}-line1`} label="Address" autoComplete="address-line1" className="sm:col-span-2" value={value.line1} onChange={(e) => set("line1", e.target.value)} error={errors.line1} required />
      <Input id={`${idPrefix}-line2`} label="Apartment, suite, etc. (optional)" autoComplete="address-line2" className="sm:col-span-2" value={value.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
      <Input id={`${idPrefix}-city`} label="City" autoComplete="address-level2" value={value.city} onChange={(e) => set("city", e.target.value)} error={errors.city} required />
      <Input id={`${idPrefix}-province`} label={country?.provinceLabel ?? "State / province"} autoComplete="address-level1" value={value.province ?? ""} onChange={(e) => set("province", e.target.value)} />
      <Input id={`${idPrefix}-postal`} label={country?.postalLabel ?? "Postal code"} autoComplete="postal-code" value={value.postalCode} onChange={(e) => set("postalCode", e.target.value)} error={errors.postalCode} required />
      <div>
        <label htmlFor={`${idPrefix}-phone`} className="label">Phone (for delivery updates)</label>
        <div className="flex">
          <span className="inline-flex items-center px-3 border border-r-0 border-rule-strong text-sm text-muted bg-ink/5" aria-hidden style={{ borderRadius: "var(--radius-ui) 0 0 var(--radius-ui)" }}>{dial}</span>
          <input id={`${idPrefix}-phone`} className="field rounded-l-none" type="tel" autoComplete="tel-national" inputMode="tel" value={(value.phone ?? "").replace(new RegExp(`^\\${dial}\\s*`), "")} onChange={(e) => set("phone", e.target.value ? `${dial} ${e.target.value.replace(/^\+\d+\s*/, "")}` : "")} aria-describedby={`${idPrefix}-phone-hint`} />
        </div>
        <p id={`${idPrefix}-phone-hint`} className="text-xs text-muted mt-1">Country code {dial} added automatically.</p>
      </div>
    </div>
  );
}
