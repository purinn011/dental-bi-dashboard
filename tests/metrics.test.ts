import { describe, expect, it } from 'vitest'
import { externalAmount, savingsAmount, sumNullable } from '../src/lib/metrics'
import type { MonthlyAggregate } from '../src/types'

const baseRow: MonthlyAggregate = {
  month: '2026-08',
  dateBasis: 'date',
  majorType: 'CAD',
  detailType: 'CAD冠（大臼歯）',
  units: 1,
  futureUnits: 0,
  internalCost: 1500,
  externalNarita: 9000,
  externalToyoDental: 9000,
  isPartialMonth: true,
  isFutureMonth: false,
}

describe('amount calculations', () => {
  it('uses the Narita Dental CAD/CAM crown external price', () => {
    expect(externalAmount(baseRow, 'narita')).toBe(9000)
  })

  it('calculates CAD/CAM crown savings as 7,500 yen per unit', () => {
    expect(savingsAmount(baseRow, 'narita')).toBe(7500)
  })

  it('selects the Narita Dental and Toyo Dental inlay prices', () => {
    const inlayRow = {
      ...baseRow,
      detailType: 'CADインレー（小臼歯）',
      externalNarita: 6560,
      externalToyoDental: 7500,
    }
    expect(externalAmount(inlayRow, 'narita')).toBe(6560)
    expect(externalAmount(inlayRow, 'toyoDental')).toBe(7500)
    expect(savingsAmount(inlayRow, 'narita')).toBe(5060)
  })

  it('calculates Zr savings and preserves a missing Narita Dental price', () => {
    const zrRow = {
      ...baseRow,
      majorType: 'Zr' as const,
      internalCost: 4580,
      externalNarita: 12000,
      externalToyoDental: 13000,
    }
    expect(savingsAmount(zrRow, 'narita')).toBe(7420)
    expect(savingsAmount(zrRow, 'toyoDental')).toBe(8420)
  })

  it('does not treat unpriced rows as zero', () => {
    const unpriced = {
      ...baseRow,
      majorType: 'Other' as const,
      internalCost: null,
      externalNarita: null,
      externalToyoDental: null,
    }
    expect(savingsAmount(unpriced, 'narita')).toBeNull()
    expect(sumNullable([null, null])).toBeNull()
  })
})
