import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = process.env.OUT_DIR || '/tmp/jokari-product-repair'
const SQL_PATH = path.join(OUT_DIR, 'repair.sql')
const REPORT_PATH = path.join(OUT_DIR, 'report.json')
const ACTOR = 'website-product-repair-script'

const APPLY = process.argv.includes('--apply')
const LIMIT = Number(process.env.LIMIT || '0')
const ONLY_ID = process.env.RECORD_ID || ''

function cleanText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function metaContent(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escaped}["'])[^>]*content=["']([^"']+)["'][^>]*>`, 'i'))
  return cleanText(match?.[1] || '')
}

function titleFromHtml(html, url) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const raw = cleanText(h1 || title || '')
  if (raw) return raw.split('|')[0].trim()
  return new URL(url).pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || url
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
    )
  }
  return value
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function sql(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function jsonSql(value) {
  return `${sql(JSON.stringify(value))}::jsonb`
}

function productDescription(value) {
  return cleanText(value)
    .replace(/\s*Jetzt bestellen!?$/i, '')
    .replace(/\s*Jetzt kaufen!?$/i, '')
    .trim()
}

function productDescriptionBullets(html) {
  const block = html.match(/<div[^>]+itemprop=["']description["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["']product__certifications/i)?.[1] || ''
  return [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean)
}

function productDetails(html) {
  const block = html.match(/id=["']productDetails["'][\s\S]*?<dl[^>]*>([\s\S]*?)<\/dl>/i)?.[1] || ''
  const details = {}
  for (const match of block.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const key = cleanText(match[1]).replace(/:$/, '')
    const value = cleanText(match[2])
    if (key && value) details[key] = value
  }
  return details
}

function relatedProductCards(html) {
  const relatedBlock = html.match(/<h2>\s*Verwandte Produkte\s*<\/h2>[\s\S]*?<div class=["']teaser__wrapper[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i)?.[0] || ''
  const products = []
  for (const match of relatedBlock.matchAll(/<div class=["']teaser__subtitle["']>\s*Art\.-Nr\.\s*([^<]+)<\/div>[\s\S]*?<div class=["']teaser__title["']>\s*([\s\S]*?)<\/div>[\s\S]*?<div class=["']teaser__text["']>\s*([\s\S]*?)<\/div>/gi)) {
    products.push(`${cleanText(match[2])} (Art.-Nr. ${cleanText(match[1])}): ${cleanText(match[3])}`)
  }
  return products
}

function normalizeProduct(url, html, oldData) {
  const title = titleFromHtml(html, url)
  const details = productDetails(html)
  const bullets = productDescriptionBullets(html)
  const description = productDescription(metaContent(html, 'description') || bullets[0] || oldData?.description || title)
  const artnr = details['Art.-Nr.'] || oldData?.artnr || oldData?.product_code || oldData?.primary_key
  const existingSpecs = oldData?.specs && typeof oldData.specs === 'object' && !Array.isArray(oldData.specs)
    ? oldData.specs
    : {}
  const {
    source: _legacySpecSource,
    source_url: _legacySpecSourceUrl,
    Quelle: _legacySpecQuelle,
    ...preservedSpecs
  } = existingSpecs
  const source = {
    ...(oldData?._source || {}),
    source_type: oldData?._source?.source_type || 'crawlee',
    source_id: oldData?._source?.source_id || `crawlee:${url}`,
    source_url: url,
    api_endpoint: oldData?._source?.api_endpoint || null,
    source_version: oldData?._source?.source_version || 'website-import-2026-04-27',
    trust_type: oldData?._source?.trust_type || 'unauthenticated_public',
    authenticated_source: oldData?._source?.authenticated_source ?? false,
  }
  const data = {
    ...oldData,
    artnr,
    name: title,
    description: description.slice(0, 6000),
    specs: {
      ...preservedSpecs,
      ...details,
      Merkmale: bullets.length ? bullets : preservedSpecs.Merkmale || [],
    },
    compatibility: relatedProductCards(html).length
      ? relatedProductCards(html)
      : (Array.isArray(oldData?.compatibility) ? oldData.compatibility : []),
  }
  delete data._source
  const contentHash = sha256(data)
  data._source = {
    ...source,
    content_hash: contentHash,
  }
  return {
    data,
    contentHash,
    evidence: [description, ...bullets, ...Object.entries(details).map(([key, value]) => `${key}: ${value}`)].join('\n').slice(0, 1000),
  }
}

async function fetchRows() {
  const idClause = ONLY_ID ? `and r.id = '${ONLY_ID.replace(/'/g, "''")}'` : ''
  const query = `
select distinct on (r.id)
  r.id,
  r.status,
  r.schema_type,
  r.primary_key,
  r.data_json,
  e.id as external_import_id,
  e.source_url,
  e.source_id,
  e.content_hash as import_content_hash
from public.records r
join public.external_imports e on e.record_id = r.id
where r.schema_type = 'ProductSpec'
  and e.source_url like 'https://jokari.de/produkte/detail/%'
  ${idClause}
order by r.id, e.imported_at desc;
`
  const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output', 'json', query], { encoding: 'utf8' })
  const parsed = JSON.parse(raw)
  const rows = parsed.rows || []
  return LIMIT > 0 ? rows.slice(0, LIMIT) : rows
}

function repairSql(item) {
  return `
with updated_record as (
update public.records
set data_json = ${jsonSql(item.nextData)},
    completeness_score = 0.85,
    version = version + 1,
    updated_at = now()
where id = ${sql(item.id)}::uuid
  and status = 'needs_review'
  and coalesce(data_json #>> '{_source,content_hash}', '') is distinct from ${sql(item.contentHash)}
returning id
),
updated_import as (

update public.external_imports
set content_hash = ${sql(item.contentHash)},
    details_json = coalesce(details_json, '{}'::jsonb) || ${jsonSql({
      action: 'data_quality_repair',
      repaired_by: ACTOR,
      previous_content_hash: item.previousHash,
      source_url: item.sourceUrl,
    })},
    imported_at = now()
where id = ${sql(item.externalImportId)}::uuid
  and exists (select 1 from updated_record)
returning id
),
deleted_evidence as (

delete from public.evidence
where record_id = ${sql(item.id)}::uuid
  and field_path = '_source'
  and exists (select 1 from updated_record)
returning id
),
inserted_evidence as (

insert into public.evidence (id, record_id, chunk_id, field_path, excerpt, start_offset, end_offset)
select ${sql(crypto.randomUUID())}::uuid, ${sql(item.id)}::uuid, null, '_source', ${sql(item.evidence)}, null, null
where exists (select 1 from updated_record)
returning id
)

insert into public.audit_logs (id, action, entity_type, entity_id, actor, details_json, timestamp)
select ${sql(crypto.randomUUID())}::uuid, 'data_quality_repair', 'Record', ${sql(item.id)}::uuid, ${sql(ACTOR)}, ${jsonSql({
    source_url: item.sourceUrl,
    previous_content_hash: item.previousHash,
    content_hash: item.contentHash,
  })}, now()
where exists (select 1 from updated_record);
`
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const rows = await fetchRows()
  const report = []
  const repairs = []

  for (const row of rows) {
    const current = row.data_json || {}
    if (row.status !== 'needs_review') {
      report.push({ id: row.id, source_url: row.source_url, status: row.status, action: 'skipped_non_review' })
      continue
    }

    try {
      const response = await fetch(row.source_url, { redirect: 'follow' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      const normalized = normalizeProduct(row.source_url, html, current)
      const currentHash = current?._source?.content_hash || row.import_content_hash || null
      const changed = normalized.contentHash !== currentHash
      const hadChaoticDescription = String(current.description || '').length > 1200
      const hadLegacySpecs = Boolean(current.specs?.source || current.specs?.source_url || !current.specs?.['Art.-Nr.'])
      const action = changed || hadChaoticDescription || hadLegacySpecs ? 'repair' : 'no_change'

      const entry = {
        id: row.id,
        primary_key: row.primary_key,
        source_url: row.source_url,
        action,
        previous_hash: currentHash,
        next_hash: normalized.contentHash,
        description_before_chars: String(current.description || '').length,
        description_after_chars: String(normalized.data.description || '').length,
        features: normalized.data.specs.Merkmale.length,
        details: Object.keys(normalized.data.specs).filter((key) => key !== 'Merkmale').length,
        compatibility: normalized.data.compatibility.length,
      }
      report.push(entry)
      if (action === 'repair') {
        repairs.push({
          id: row.id,
          sourceUrl: row.source_url,
          externalImportId: row.external_import_id,
          nextData: normalized.data,
          contentHash: normalized.contentHash,
          previousHash: currentHash,
          evidence: normalized.evidence,
        })
      }
    } catch (error) {
      report.push({ id: row.id, source_url: row.source_url, action: 'failed', error: error.message })
    }
  }

  const sqlText = `begin;\n${repairs.map(repairSql).join('\n')}\ncommit;\n`
  await fs.writeFile(SQL_PATH, sqlText)
  await fs.writeFile(REPORT_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    apply: APPLY,
    rows: rows.length,
    repairs: repairs.length,
    report,
  }, null, 2))

  if (APPLY && repairs.length > 0) {
    execFileSync('supabase', ['db', 'query', '--linked', '--file', SQL_PATH], { stdio: 'inherit' })
  }

  console.log(JSON.stringify({
    rows: rows.length,
    repairs: repairs.length,
    sql_path: SQL_PATH,
    report_path: REPORT_PATH,
    applied: APPLY,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
