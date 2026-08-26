import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DashboardData } from '../src/types'

const data = JSON.parse(
  readFileSync(new URL('../public/data/dashboard.json', import.meta.url), 'utf8'),
) as DashboardData

describe('generated dashboard data', () => {
  it('matches the provisional source-data control totals', () => {
    expect(data.meta.sourceRows).toBe(1924)
    expect(data.meta.acceptedRows).toBe(1822)
    expect(data.meta.reviewRows).toBe(102)
    expect(data.meta.expandedUnits).toBe(2043)
    expect(data.meta.validDateUnits).toBe(2039)
    expect(data.meta.validSetDateUnits).toBe(1954)

    const dateUnits = data.monthly
      .filter((row) => row.dateBasis === 'date')
      .reduce((sum, row) => sum + row.units, 0)
    const setDateUnits = data.monthly
      .filter((row) => row.dateBasis === 'setDate')
      .reduce((sum, row) => sum + row.units, 0)

    expect(dateUnits).toBe(2039)
    expect(setDateUnits).toBe(1954)
  })

  it('contains only aggregated, allowlisted monthly fields', () => {
    const allowed = new Set([
      'month', 'dateBasis', 'majorType', 'detailType', 'units', 'futureUnits',
      'internalCost', 'externalNarita', 'externalToyoDental',
      'insurancePointsMin', 'insurancePointsMax', 'insuranceAmountMin',
      'insuranceAmountMax', 'insuranceSchedule', 'isPartialMonth', 'isFutureMonth',
    ])
    for (const row of data.monthly) {
      expect(Object.keys(row).every((key) => allowed.has(key))).toBe(true)
    }
  })

  it('contains only aggregated clinic production fields', () => {
    const allowed = new Set([
      'month', 'dateBasis', 'majorType', 'detailType', 'clinic',
      'units', 'futureUnits', 'isPartialMonth', 'isFutureMonth',
    ])
    for (const row of data.productionDimensions) {
      expect(Object.keys(row).every((key) => allowed.has(key))).toBe(true)
    }

    const dateUnits = data.productionDimensions
      .filter((row) => row.dateBasis === 'date')
      .reduce((sum, row) => sum + row.units, 0)
    const setDateUnits = data.productionDimensions
      .filter((row) => row.dateBasis === 'setDate')
      .reduce((sum, row) => sum + row.units, 0)

    expect(dateUnits).toBe(data.meta.validDateUnits)
    expect(setDateUnits).toBe(data.meta.validSetDateUnits)
  })

  it('prices e.max externally and uses the supplied 4,555 yen internal cost', () => {
    const emaxRows = data.monthly.filter((row) => row.detailType === 'e.max')
    expect(emaxRows.length).toBeGreaterThan(0)
    expect(emaxRows.every((row) => row.internalCost === row.units * 4555)).toBe(true)
    expect(emaxRows.every((row) => row.externalNarita === row.units * 12000)).toBe(true)
    expect(emaxRows.every((row) => row.externalToyoDental === row.units * 13000)).toBe(true)

    const unpricedOthers = data.monthly.filter((row) => row.majorType === 'Other' && row.detailType !== 'e.max')
    expect(unpricedOthers.every((row) => row.internalCost === null && row.externalNarita === null)).toBe(true)
  })

  it('applies the Reiwa 8 insurance master only from June 2026', () => {
    const eligible = data.monthly.filter((row) => row.detailType === 'CAD冠（大臼歯）')
    expect(eligible.filter((row) => row.month < '2026-06').every((row) => row.insurancePointsMin === null)).toBe(true)
    expect(eligible.filter((row) => row.month >= '2026-06').every((row) =>
      row.insurancePointsMin === row.units * 2497 &&
      row.insurancePointsMax === row.units * 2999 &&
      row.insuranceAmountMin === row.units * 24970 &&
      row.insuranceAmountMax === row.units * 29990
    )).toBe(true)
  })

  it('publishes a formula-reconciling CAD/CAM point table', () => {
    expect(data.insuranceMaster.pointTable).toHaveLength(13)
    for (const row of data.insuranceMaster.pointTable) {
      expect(
        row.formation + row.cadFormation + row.opticalImpression +
        row.cadTechnology + row.placement + row.innerSurface + row.maintenance +
        row.cadMaterial + row.adhesiveMaterial,
      ).toBe(row.totalPoints)
    }
  })

  it('stores vendor prices without converting missing prices to zero', () => {
    const smallInlays = data.monthly.filter((row) => row.detailType === 'CADインレー（小臼歯）')
    expect(smallInlays.every((row) => row.externalNarita === row.units * 6560)).toBe(true)
    expect(smallInlays.every((row) => row.externalToyoDental === row.units * 7500)).toBe(true)

    const smallOnlays = data.monthly.filter((row) => row.detailType === 'CADアンレー（小臼歯）')
    expect(smallOnlays.length).toBeGreaterThan(0)
    expect(smallOnlays.every((row) => row.externalNarita === row.units * 7500)).toBe(true)
    expect(smallOnlays.every((row) => row.externalToyoDental === row.units * 7500)).toBe(true)

    const largeOnlays = data.monthly.filter((row) => row.detailType === 'CADアンレー（大臼歯）')
    expect(largeOnlays.length).toBeGreaterThan(0)
    expect(largeOnlays.every((row) => row.externalNarita === row.units * 7500)).toBe(true)
    expect(largeOnlays.every((row) => row.externalToyoDental === row.units * 8000)).toBe(true)

    const zirconiaCrowns = data.monthly.filter((row) => row.detailType === 'Zrクラウン')
    expect(zirconiaCrowns.every((row) => row.externalNarita === row.units * 12000)).toBe(true)
    expect(zirconiaCrowns.every((row) => row.externalToyoDental === row.units * 13000)).toBe(true)

    const zirconiaInlays = data.monthly.filter((row) => row.detailType === 'Zrインレー')
    expect(zirconiaInlays.every((row) => row.externalNarita === row.units * 12000)).toBe(true)
    expect(zirconiaInlays.every((row) => row.externalToyoDental === row.units * 7900)).toBe(true)

    const zirconiaOnlays = data.monthly.filter((row) => row.detailType === 'Zrアンレー')
    expect(zirconiaOnlays.every((row) => row.externalNarita === row.units * 12000)).toBe(true)
    expect(zirconiaOnlays.every((row) => row.externalToyoDental === row.units * 7900)).toBe(true)
  })
})
