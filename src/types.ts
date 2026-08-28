export type DateBasis = 'date' | 'setDate'
export type MajorType = 'CAD' | 'Zr' | 'Other'
export type DashboardView = 'performance' | 'insurance' | 'priceComparison' | 'retainer'
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

export interface InsurancePointTableRow {
  detailType: string
  pulpStatus: string
  materialClass: string
  formation: number
  cadFormation: number
  opticalImpression: number
  cadTechnology: number
  placement: number
  innerSurface: number
  maintenance: number
  cadMaterial: number
  adhesiveMaterial: number
  totalPoints: number
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
  pointTable: InsurancePointTableRow[]
  sources: Array<{ label: string; url: string }>
  notes: string[]
}

export interface ProductionDimensionAggregate {
  month: string
  dateBasis: DateBasis
  majorType: MajorType
  detailType: string
  clinic: string
  units: number
  futureUnits: number
  isPartialMonth: boolean
  isFutureMonth: boolean
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
  productionDimensions: ProductionDimensionAggregate[]
}

export interface RetainerRouteDefinition {
  label: string
  externalCostPerCase: number
  modelCostPerCase: number
}

export interface RetainerMaster {
  version: string
  salePricePerCase: number
  setsPerCase: number
  sheetsPerArchPerSet: number
  sheetCost: number
  modelResinPerArch: number
  routes: {
    gcOrtho: RetainerRouteDefinition
    toyoDental: RetainerRouteDefinition
    inHouse: RetainerRouteDefinition
  }
  notes: string[]
}

export interface RetainerMonthlyClinicAggregate {
  month: string
  clinic: string
  cases: number
  standardCases: number
  singleArchCases: number
  unknownArchCases: number
  knownSheets: number
}

export interface RetainerData {
  meta: {
    schemaVersion: string
    generatedAt: string
    asOf: string
    sourceRows: number
    fourSetCases: number
    standardCases: number
    singleArchCases: number
    unknownArchCases: number
    knownSheets: number
    validDateCases: number
    invalidDateCases: number
    masterVersion: string
  }
  master: RetainerMaster
  monthlyClinics: RetainerMonthlyClinicAggregate[]
}
