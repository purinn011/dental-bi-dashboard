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
const outputArg = readArg('output', 'public/data/retainer.json')

if (!inputArg) {
  console.error('Usage: npm run data:retainer -- --input <csv-path> [--as-of YYYY-MM-DD]')
  process.exit(1)
}

const inputPath = resolve(process.cwd(), inputArg)
const outputPath = resolve(projectRoot, outputArg)
const reportPath = resolve(projectRoot, 'build-reports/retainer-data-quality-report.json')

const [csvText, master] = await Promise.all([
  readFile(inputPath, 'utf8'),
  readFile(resolve(projectRoot, 'config/retainer-master.json'), 'utf8').then(JSON.parse),
])

const rows = parse(csvText.replace(/^\uFEFF/, ''), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
})

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, '')
}

function parseDate(value) {
  const text = normalize(value)
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

function classifyArch(value) {
  const text = normalize(value)
  if (text.includes('上下')) return 'upperLower'
  if (text.includes('上のみ') || text.includes('下のみ')) return 'single'
  return 'unknown'
}

const quality = {
  sourceRows: rows.length,
  fourSetCases: 0,
  standardCases: 0,
  singleArchCases: 0,
  unknownArchCases: 0,
  knownSheets: 0,
  validDateCases: 0,
  invalidDateCases: 0,
}

const aggregates = new Map()

for (const row of rows) {
  if (normalize(row['セット数']) !== '4セット') continue

  quality.fourSetCases += 1
  const date = parseDate(row['日付'])
  const clinic = normalize(row['医院']) || '未設定'
  const arch = classifyArch(row['種類選択式'])

  if (!date) {
    quality.invalidDateCases += 1
    continue
  }

  quality.validDateCases += 1
  const month = date.slice(0, 7)
  const sheets = arch === 'upperLower'
    ? master.setsPerCase * 2 * master.sheetsPerArchPerSet
    : arch === 'single'
      ? master.setsPerCase * master.sheetsPerArchPerSet
      : 0

  if (arch === 'upperLower') quality.standardCases += 1
  if (arch === 'single') quality.singleArchCases += 1
  if (arch === 'unknown') quality.unknownArchCases += 1
  quality.knownSheets += sheets

  const key = `${month}|${clinic}`
  if (!aggregates.has(key)) {
    aggregates.set(key, {
      month,
      clinic,
      cases: 0,
      standardCases: 0,
      singleArchCases: 0,
      unknownArchCases: 0,
      knownSheets: 0,
    })
  }

  const target = aggregates.get(key)
  target.cases += 1
  target.standardCases += arch === 'upperLower' ? 1 : 0
  target.singleArchCases += arch === 'single' ? 1 : 0
  target.unknownArchCases += arch === 'unknown' ? 1 : 0
  target.knownSheets += sheets
}

const monthlyClinics = [...aggregates.values()].sort((a, b) =>
  a.month.localeCompare(b.month) || a.clinic.localeCompare(b.clinic, 'ja')
)

const retainer = {
  meta: {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    asOf,
    sourceRows: quality.sourceRows,
    fourSetCases: quality.fourSetCases,
    standardCases: quality.standardCases,
    singleArchCases: quality.singleArchCases,
    unknownArchCases: quality.unknownArchCases,
    knownSheets: quality.knownSheets,
    validDateCases: quality.validDateCases,
    invalidDateCases: quality.invalidDateCases,
    masterVersion: master.version,
  },
  master,
  monthlyClinics,
}

await Promise.all([
  mkdir(dirname(outputPath), { recursive: true }),
  mkdir(dirname(reportPath), { recursive: true }),
])

await Promise.all([
  writeFile(outputPath, `${JSON.stringify(retainer, null, 2)}\n`, 'utf8'),
  writeFile(reportPath, `${JSON.stringify({
    generatedAt: retainer.meta.generatedAt,
    asOf,
    source: basename(inputPath),
    ...quality,
  }, null, 2)}\n`, 'utf8'),
])

console.log(`Generated ${outputPath}`)
console.log(`Rows: ${quality.sourceRows}; four-set cases: ${quality.fourSetCases}; standard: ${quality.standardCases}`)
console.log(`Single arch: ${quality.singleArchCases}; unknown arch: ${quality.unknownArchCases}; known sheets: ${quality.knownSheets}`)
