import { readFile, readdir } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const dashboardPath = resolve(projectRoot, 'public/data/dashboard.json')
const retainerPath = resolve(projectRoot, 'public/data/retainer.json')
const dashboard = JSON.parse(await readFile(dashboardPath, 'utf8'))
const retainer = JSON.parse(await readFile(retainerPath, 'utf8'))

const allowedTopLevel = new Set(['meta', 'priceMaster', 'insuranceMaster', 'monthly', 'productionDimensions'])
const allowedMeta = new Set([
  'schemaVersion', 'generatedAt', 'asOf', 'sourceRows', 'acceptedRows', 'reviewRows',
  'expandedUnits', 'validDateUnits', 'validSetDateUnits', 'missingPartRows',
  'missingTypeRows', 'invalidDateRows', 'invalidSetDateRows', 'typeMasterVersion',
  'priceMasterVersion', 'insuranceMasterVersion',
])
const allowedMonthly = new Set([
  'month', 'dateBasis', 'majorType', 'detailType', 'units', 'futureUnits',
  'internalCost', 'externalNarita', 'externalToyoDental', 'isPartialMonth',
  'isFutureMonth', 'insurancePointsMin', 'insurancePointsMax',
  'insuranceAmountMin', 'insuranceAmountMax', 'insuranceSchedule',
])
const allowedProductionDimension = new Set([
  'month', 'dateBasis', 'majorType', 'detailType', 'clinic', 'units',
  'futureUnits', 'isPartialMonth', 'isFutureMonth',
])
const allowedRetainerTopLevel = new Set(['meta', 'master', 'monthlyClinics'])
const allowedRetainerMeta = new Set([
  'schemaVersion', 'generatedAt', 'asOf', 'sourceRows', 'fourSetCases',
  'standardCases', 'singleArchCases', 'unknownArchCases', 'knownSheets',
  'validDateCases', 'invalidDateCases', 'masterVersion',
])
const allowedRetainerMonthlyClinic = new Set([
  'month', 'clinic', 'cases', 'standardCases', 'singleArchCases',
  'unknownArchCases', 'knownSheets',
])

function rejectUnknownKeys(object, allowed, label) {
  const unknown = Object.keys(object).filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`${label} has forbidden keys: ${unknown.join(', ')}`)
}

rejectUnknownKeys(dashboard, allowedTopLevel, 'dashboard')
rejectUnknownKeys(dashboard.meta, allowedMeta, 'meta')
dashboard.monthly.forEach((row, index) => rejectUnknownKeys(row, allowedMonthly, `monthly[${index}]`))
dashboard.productionDimensions.forEach((row, index) => rejectUnknownKeys(row, allowedProductionDimension, `productionDimensions[${index}]`))
rejectUnknownKeys(retainer, allowedRetainerTopLevel, 'retainer')
rejectUnknownKeys(retainer.meta, allowedRetainerMeta, 'retainer.meta')
retainer.monthlyClinics.forEach((row, index) => rejectUnknownKeys(row, allowedRetainerMonthlyClinic, `retainer.monthlyClinics[${index}]`))

const forbiddenText = ['患者名', '患者No.', 'カルテNo', '担当Dr', 'シェード', '備考', '更新者', 'コメント']

async function scanDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await scanDirectory(path)
      continue
    }
    if (!['.html', '.js', '.json', '.css', '.svg'].includes(extname(entry.name))) continue
    const text = await readFile(path, 'utf8')
    for (const forbidden of forbiddenText) {
      if (text.includes(forbidden)) throw new Error(`Forbidden source header found in ${path}: ${forbidden}`)
    }
  }
}

await scanDirectory(resolve(projectRoot, 'dist'))
console.log('Privacy check passed: dashboard and retainer schemas are allowlisted and no source headers were found in dist.')
