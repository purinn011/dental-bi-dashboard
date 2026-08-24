import { readFile, readdir } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const dashboardPath = resolve(projectRoot, 'public/data/dashboard.json')
const dashboard = JSON.parse(await readFile(dashboardPath, 'utf8'))

const allowedTopLevel = new Set(['meta', 'priceMaster', 'monthly'])
const allowedMeta = new Set([
  'schemaVersion', 'generatedAt', 'asOf', 'sourceRows', 'acceptedRows', 'reviewRows',
  'expandedUnits', 'validDateUnits', 'validSetDateUnits', 'missingPartRows',
  'missingTypeRows', 'invalidDateRows', 'invalidSetDateRows', 'typeMasterVersion',
  'priceMasterVersion',
])
const allowedMonthly = new Set([
  'month', 'dateBasis', 'majorType', 'detailType', 'units', 'futureUnits',
  'internalCost', 'externalNarita', 'externalToyoDental', 'isPartialMonth',
  'isFutureMonth',
])

function rejectUnknownKeys(object, allowed, label) {
  const unknown = Object.keys(object).filter((key) => !allowed.has(key))
  if (unknown.length) throw new Error(`${label} has forbidden keys: ${unknown.join(', ')}`)
}

rejectUnknownKeys(dashboard, allowedTopLevel, 'dashboard')
rejectUnknownKeys(dashboard.meta, allowedMeta, 'meta')
dashboard.monthly.forEach((row, index) => rejectUnknownKeys(row, allowedMonthly, `monthly[${index}]`))

const forbiddenText = ['患者名', 'カルテNo', '担当Dr', 'シェード', '備考', '更新者']

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
console.log('Privacy check passed: public schema is allowlisted and no source headers were found in dist.')
