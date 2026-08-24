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
  externalLow: 9000,
  externalMid: 9000,
  externalHigh: 9000,
  isPartialMonth: true,
  isFutureMonth: false,
}

describe('amount calculations', () => {
  it('uses the fixed CAD/CAM crown external price', () => {
    expect(externalAmount(baseRow, 'adopted')).toBe(9000)
  })

  it('calculates CAD/CAM crown savings as 7,500 yen per unit', () => {
    expect(savingsAmount(baseRow, 'adopted')).toBe(7500)
  })

  it('selects the adopted, Narita Dental, and Toyo Dental inlay prices', () => {
    const inlayRow = {
      ...baseRow,
      detailType: 'CADインレー（小臼歯）',
      externalLow: 7500,
      externalMid: 6560,
      externalHigh: 7500,
    }
    expect(externalAmount(inlayRow, 'adopted')).toBe(7500)
    expect(externalAmount(inlayRow, 'narita')).toBe(6560)
    expect(externalAmount(inlayRow, 'toyoDental')).toBe(7500)
    expect(savingsAmount(inlayRow, 'adopted')).toBe(6000)
    expect(savingsAmount(inlayRow, 'narita')).toBe(5060)
  })

  it('calculates Zr savings and preserves a missing Narita Dental price', () => {
    const zrRow = {
      ...baseRow,
      majorType: 'Zr' as const,
      internalCost: 4580,
      externalLow: 12000,
      externalMid: null,
      externalHigh: 13000,
    }
    expect(savingsAmount(zrRow, 'adopted')).toBe(7420)
    expect(savingsAmount(zrRow, 'narita')).toBeNull()
    expect(savingsAmount(zrRow, 'toyoDental')).toBe(8420)
  })

  it('does not treat unpriced rows as zero', () => {
    const unpriced = {
      ...baseRow,
      majorType: 'Other' as const,
      internalCost: null,
      externalLow: null,
      externalMid: null,
      externalHigh: null,
    }
    expect(savingsAmount(unpriced, 'adopted')).toBeNull()
    expect(sumNullable([null, null])).toBeNull()
  })
})
