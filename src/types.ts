export type DateBasis = 'date' | 'setDate'
export type MajorType = 'CAD' | 'Zr' | 'Other'
export type DashboardView = 'performance' | 'insurance' | 'priceComparison'
export type OutsourcePriceSource = 'narita' | 'toyoDental'

export interface PriceDefinition {
  internal: number | null
  external: Record<OutsourcePriceSource, number | null>
}

export interface PriceMaster {
  defaults: Partial<Record<MajorType, PriceDefinition>>
  details: Record<string, PriceDefinition>
}

export interface InsuranceDefinition {
  pointsMin: number
  pointsMax: number
  precision: string
}

export interface InsuranceMaster {
  version: string
  schedule: string
  effectiveFrom: string
  effectiveTo: string | null
  pointValueYen: number
  assumptions: {
    opticalImpression: number
    adhesiveMaterial: number
    dentalTechnicianCollaboration: number
    patientCopayRate: number
  }
  details: Record<string, InsuranceDefinition>
  sources: Array<{ label: string; url: string }>
  notes: string[]
}

export interface MonthlyAggregate {
  month: string
  dateBasis: DateBasis
  majorType: MajorType
  detailType: string
  units: number
  futureUnits: number
  internalCost: number | null
  externalNarita: number | null
  externalToyoDental: number | null
  insurancePointsMin: number | null
  insurancePointsMax: number | null
  insuranceAmountMin: number | null
  insuranceAmountMax: number | null
  insuranceSchedule: string | null
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
  insuranceMasterVersion: string
}

export interface DashboardData {
  meta: DashboardMeta
  priceMaster: PriceMaster
  insuranceMaster: InsuranceMaster
  monthly: MonthlyAggregate[]
}
