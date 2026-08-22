export type DateBasis = 'date' | 'setDate'
export type MajorType = 'CAD' | 'Zr' | 'Other'
export type Scenario = 'low' | 'mid' | 'high'

export interface PriceDefinition {
  internal: number
  external: Record<Scenario, number>
}

export interface MonthlyAggregate {
  month: string
  dateBasis: DateBasis
  majorType: MajorType
  detailType: string
  units: number
  futureUnits: number
  internalCost: number | null
  externalLow: number | null
  externalMid: number | null
  externalHigh: number | null
  isPartialMonth: boolean
  isFutureMonth: boolean
}

export interface DashboardMeta {
  schemaVersion: string
  generatedAt: string
  asOf: string
  sourceRows: number
  acceptedRows: number
  reviewRows: number
  expandedUnits: number
  validDateUnits: number
  validSetDateUnits: number
  missingPartRows: number
  missingTypeRows: number
  invalidDateRows: number
  invalidSetDateRows: number
  typeMasterVersion: string
  priceMasterVersion: string
}

export interface DashboardData {
  meta: DashboardMeta
  priceMaster: Partial<Record<MajorType, PriceDefinition>>
  monthly: MonthlyAggregate[]
}
