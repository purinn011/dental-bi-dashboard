import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const inputArg = readArg('input')
const asOf = readArg('as-of', new Date().toISOString().slice(0, 10))
const outputArg = readArg('output', 'public/data/dashboard.json')

if (!inputArg) {
  console.error('Usage: npm run data:build -- --input <csv-path> [--as-of YYYY-MM-DD]')
  process.exit(1)
}

const inputPath = resolve(process.cwd(), inputArg)
const outputPath = resolve(projectRoot, outputArg)
const reportPath = resolve(projectRoot, 'build-reports/data-quality-report.json')

const [csvText, typeMaster, priceMaster] = await Promise.all([
  readFile(inputPath, 'utf8'),
  readFile(resolve(projectRoot, 'config/type-master.json'), 'utf8').then(JSON.parse),
  readFile(resolve(projectRoot, 'config/price-master.json'), 'utf8').then(JSON.parse),
])

const rows = parse(csvText.replace(/^\uFEFF/, ''), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
})

function parseArray(value) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return [String(value)]
  }
}

function parseDate(value) {
  if (!value) return null
  const text = String(value).trim()
  const reiwa = text.match(/^令和(\d+)年(\d+)月(\d+)日$/)
  if (reiwa) {
    const [, year, month, day] = reiwa
    return `${2018 + Number(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const western = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (western) {
    const [, year, month, day] = western
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

function normalizeType(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replace(/\s+/g, '')
}

function classifyType(rawType) {
  const normalized = normalizeType(rawType)
  const exact = typeMaster.mappings[normalized]
  if (exact) return { ...exact, normalized }

  if (normalized.includes('zr') || normalized.includes('ジル')) {
    return { majorType: 'Zr', detailType: `Zr（未登録：${normalized}）`, normalized }
  }
  if (normalized.includes('cad') || normalized.includes('cerec')) {
    return { majorType: 'CAD', detailType: `CAD（未登録：${normalized}）`, normalized }
  }
  return { majorType: 'Other', detailType: rawType || '未分類', normalized }
}

function getReviewReason(parts, types) {
  if (parts.length === 0 && types.length === 0) return 'missing_parts_and_types'
  if (parts.length === 0) return 'missing_parts'
  if (types.length === 0) return 'missing_types'
  return 'mismatched_array_lengths'
}

const quality = {
  sourceRows: rows.length,
  acceptedRows: 0,
  reviewRows: 0,
  expandedUnits: 0,
  validDateUnits: 0,
  validSetDateUnits: 0,
  invalidDateRows: 0,
  invalidSetDateRows: 0,
  missingPartRows: 0,
  missingTypeRows: 0,
  reviewReasons: {},
  reviewRowNumbers: [],
  unmappedNormalizedTypes: [],
}

const units = []
const unmappedTypes = new Set()

for (const [index, row] of rows.entries()) {
  const rowNumber = index + 2
  const parts = parseArray(row['部位'])
  const rawTypes = parseArray(row['補綴物'])
  const date = parseDate(row['日付'])
  const setDate = parseDate(row['セット日'])

  if (!date) quality.invalidDateRows += 1
  if (!setDate) quality.invalidSetDateRows += 1
  if (parts.length === 0) quality.missingPartRows += 1
  if (rawTypes.length === 0) quality.missingTypeRows += 1

  const canExpand = parts.length > 0 && rawTypes.length > 0 &&
    (rawTypes.length === 1 || rawTypes.length === parts.length)

  if (!canExpand) {
    const reason = getReviewReason(parts, rawTypes)
    quality.reviewRows += 1
    quality.reviewReasons[reason] = (quality.reviewReasons[reason] ?? 0) + 1
    quality.reviewRowNumbers.push({ rowNumber, reason })
    continue
  }

  quality.acceptedRows += 1
  const expandedTypes = rawTypes.length === 1
    ? Array(parts.length).fill(rawTypes[0])
    : rawTypes

  for (const rawType of expandedTypes) {
    const classified = classifyType(rawType)
    if (!typeMaster.mappings[classified.normalized]) unmappedTypes.add(classified.normalized)
    units.push({ date, setDate, ...classified })
  }
}

quality.expandedUnits = units.length
quality.validDateUnits = units.filter((unit) => unit.date).length
quality.validSetDateUnits = units.filter((unit) => unit.setDate).length
quality.unmappedNormalizedTypes = [...unmappedTypes].sort()

const aggregates = new Map()
const asOfMonth = asOf.slice(0, 7)

function addAggregate(dateBasis, isoDate, unit) {
  if (!isoDate) return
  const month = isoDate.slice(0, 7)
  const key = [dateBasis, month, unit.majorType, unit.detailType].join('|')
  const price = priceMaster.details[unit.detailType] ?? priceMaster.defaults[unit.majorType]
  const isFuture = isoDate > asOf

  if (!aggregates.has(key)) {
    aggregates.set(key, {
      month,
      dateBasis,
      majorType: unit.majorType,
      detailType: unit.detailType,
      units: 0,
      futureUnits: 0,
      internalCost: price ? 0 : null,
      externalLow: price?.external.adopted !== null && price?.external.adopted !== undefined ? 0 : null,
      externalMid: price?.external.narita !== null && price?.external.narita !== undefined ? 0 : null,
      externalHigh: price?.external.toyoDental !== null && price?.external.toyoDental !== undefined ? 0 : null,
      isPartialMonth: month === asOfMonth,
      isFutureMonth: month > asOfMonth,
    })
  }

  const target = aggregates.get(key)
  target.units += 1
  if (isFuture) target.futureUnits += 1
  if (price) {
    target.internalCost += price.internal
    if (target.externalLow !== null) target.externalLow += price.external.adopted
    if (target.externalMid !== null) target.externalMid += price.external.narita
    if (target.externalHigh !== null) target.externalHigh += price.external.toyoDental
  }
}

for (const unit of units) {
  addAggregate('date', unit.date, unit)
  addAggregate('setDate', unit.setDate, unit)
}

const monthly = [...aggregates.values()].sort((a, b) =>
  a.month.localeCompare(b.month) ||
  a.dateBasis.localeCompare(b.dateBasis) ||
  a.majorType.localeCompare(b.majorType) ||
  a.detailType.localeCompare(b.detailType)
)

const dashboard = {
  meta: {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    asOf,
    sourceRows: quality.sourceRows,
    acceptedRows: quality.acceptedRows,
    reviewRows: quality.reviewRows,
    expandedUnits: quality.expandedUnits,
    validDateUnits: quality.validDateUnits,
    validSetDateUnits: quality.validSetDateUnits,
    missingPartRows: quality.missingPartRows,
    missingTypeRows: quality.missingTypeRows,
    invalidDateRows: quality.invalidDateRows,
    invalidSetDateRows: quality.invalidSetDateRows,
    typeMasterVersion: typeMaster.version,
    priceMasterVersion: priceMaster.version,
  },
  priceMaster: {
    defaults: priceMaster.defaults,
    details: priceMaster.details,
  },
  monthly,
}

await Promise.all([
  mkdir(dirname(outputPath), { recursive: true }),
  mkdir(dirname(reportPath), { recursive: true }),
])

await Promise.all([
  writeFile(outputPath, `${JSON.stringify(dashboard, null, 2)}\n`, 'utf8'),
  writeFile(reportPath, `${JSON.stringify({
    generatedAt: dashboard.meta.generatedAt,
    asOf,
    source: basename(inputPath),
    ...quality,
  }, null, 2)}\n`, 'utf8'),
])

console.log(`Generated ${outputPath}`)
console.log(`Rows: ${quality.sourceRows}; accepted: ${quality.acceptedRows}; review: ${quality.reviewRows}`)
console.log(`Units: ${quality.expandedUnits}; date-valid: ${quality.validDateUnits}; set-date-valid: ${quality.validSetDateUnits}`)
