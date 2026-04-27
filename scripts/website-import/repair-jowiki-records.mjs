import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = process.env.OUT_DIR || '/tmp/jokari-jowiki-repair'
const SQL_PATH = path.join(OUT_DIR, 'repair.sql')
const REPORT_PATH = path.join(OUT_DIR, 'report.json')
const ACTOR = 'jowiki-repair-script'
const DEFAULT_SUPABASE_URL = 'https://gqezmqopvjvpdnknmfap.supabase.co'
const DEFAULT_BUCKET = 'documents'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

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

function cleanRichText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

function envFileValue(key) {
  try {
    const env = execFileSync('sed', ['-n', `s/^${key}=//p`, 'backend/.env'], { encoding: 'utf8' }).trim()
    return env || ''
  } catch {
    return ''
  }
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || envFileValue('SUPABASE_URL') || DEFAULT_SUPABASE_URL
}

function supabaseBucket() {
  return process.env.SUPABASE_BUCKET || envFileValue('SUPABASE_BUCKET') || DEFAULT_BUCKET
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || envFileValue('SUPABASE_SERVICE_ROLE_KEY') || ''
}

function linkedProjectRef() {
  try {
    return execFileSync('cat', ['supabase/.temp/project-ref'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function validateApplyConfig() {
  if (!APPLY) return
  const key = serviceRoleKey()
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for --apply')
  const url = supabaseUrl()
  const ref = linkedProjectRef()
  if (ref && !url.includes(ref)) {
    throw new Error(`Supabase URL does not match linked project ref ${ref}`)
  }
}

function extractFieldText(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<div[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'))
  return cleanRichText(match?.[1] || '')
}

function extractFieldItems(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = className === 'field-kategorie'
    ? html.match(/<div[^>]+class=["'][^"']*field-kategorie[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["'][^"']*field-interaktiver-inhalt/i)
    : html.match(new RegExp(`<div[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'))
  if (!match) return []
  return [...match[1].matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)]
    .map((item) => cleanText(item[1]))
    .filter(Boolean)
}

function extractH5PContent(html, baseUrl) {
  const result = { texts: [], images: [] }
  const settingsRaw = html.match(/<script[^>]+data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (!settingsRaw) return result

  let settings
  try {
    settings = JSON.parse(settingsRaw)
  } catch {
    return result
  }

  const contents = settings?.h5p?.H5PIntegration?.contents || {}
  for (const [cid, entry] of Object.entries(contents)) {
    let content
    try {
      content = JSON.parse(entry?.jsonContent || '{}')
    } catch {
      continue
    }

    const contentId = cid.replace(/^cid-/, '')
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      const params = node.params || node.content?.params
      if (typeof params?.text === 'string') {
        const text = cleanRichText(params.text)
        if (text) result.texts.push(text)
      }
      const filePath = params?.file?.path
      if (filePath) {
        result.images.push(new URL(`/sites/default/files/h5p/content/${contentId}/${filePath}`, baseUrl).href)
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk)
        else if (value && typeof value === 'object') walk(value)
      }
    }
    walk(content)
  }
  result.texts = [...new Set(result.texts)]
  result.images = [...new Set(result.images)]
  return result
}

function cleanFallbackWebsiteText(value) {
  let text = cleanText(value)
  const markers = [
    'Geschichte der Kabelentwicklung:',
    'Kabelbearbeitung:',
    'Isolierstoffe:',
    'Werkzeugkunde:',
  ]
  for (const marker of markers) {
    const index = text.indexOf(marker)
    if (index > 0) {
      text = text.slice(index).trim()
      break
    }
  }
  for (const pattern of [
    /\bDirekt zum Inhalt\b/i,
    /\bGerman English Login\b/i,
    /\bLogin\s*-->/i,
    /\bSuchen\s*-->/i,
    /\bAnmelden oder Registrieren\b/i,
    /\bJOKARI GmbH\b/i,
    /\bImpressum\b/i,
  ]) {
    const match = pattern.exec(text)
    if (match && match.index > 10) {
      text = text.slice(0, match.index).trim()
      break
    }
  }
  return text
}

function relatedProducts(text) {
  const matches = text.match(/\b(?:JOKARI\s+)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9+-]*(?:\s+(?:No\.?\s*)?[A-ZÄÖÜ]?[A-Za-zÄÖÜäöüß0-9+-]+){0,3}\b/g) || []
  const blocked = new Set(['German', 'English', 'Login', 'Suchen', 'JOKARI GmbH', 'Direkt zum Inhalt'])
  return [...new Set(matches.map((match) => match.trim()).filter((match) => {
    const lower = match.toLowerCase()
    return match.length >= 4 && !blocked.has(match) && ['jokari', 'secura', 'sensor', 'strip', 'kabelmesser', 'abisolierzange', 'entmanteler'].some((marker) => lower.includes(marker))
  }))].slice(0, 10)
}

function normalizeJowiki(url, html, oldData) {
  const title = titleFromHtml(html, url)
  const h5p = extractH5PContent(html, url)
  const intro = extractFieldText(html, 'field-beschreibung')
  const categories = extractFieldItems(html, 'field-kategorie')
  const answer = [intro, ...h5p.texts].filter(Boolean).join('\n\n') || cleanFallbackWebsiteText(html)
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
    question: oldData?.question || title,
    answer: answer.slice(0, 6000),
    category: categories.join(' / ') || oldData?.category || 'JO!Wiki',
    related_products: relatedProducts(answer),
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
    evidence: answer.slice(0, 1000),
    imageUrl: h5p.images[0] || null,
    imageUrls: h5p.images,
    imageCount: h5p.images.length,
    textCount: h5p.texts.length,
  }
}

function fileNameFromUrl(url) {
  const pathname = new URL(url).pathname
  return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || 'jowiki-image.png')
}

function extensionFromContentType(contentType, fallbackName) {
  if (contentType.includes('png')) return '.png'
  if (contentType.includes('webp')) return '.webp'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg'
  const ext = path.extname(fallbackName)
  return ext || '.png'
}

async function prepareAsset(imageUrl) {
  if (!imageUrl) return null
  const hostname = new URL(imageUrl).hostname
  if (hostname !== 'www.jostudy.de' && hostname !== 'jostudy.de') {
    throw new Error(`Refusing non-JOStudy image host: ${hostname}`)
  }
  const response = await fetch(imageUrl, { redirect: 'follow' })
  if (!response.ok) throw new Error(`image ${imageUrl} returned HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  if (!contentType.startsWith('image/')) throw new Error(`${imageUrl} is not an image`)
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_IMAGE_BYTES) throw new Error(`${imageUrl} is too large (${contentLength} bytes)`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`${imageUrl} is too large (${bytes.length} bytes)`)
  const filename = fileNameFromUrl(imageUrl)
  const extension = extensionFromContentType(contentType, filename)
  const imageHash = crypto.createHash('sha256').update(bytes).digest('hex')
  const objectPath = `documents/jowiki-${imageHash}${extension}`
  return {
    imageUrl,
    filename,
    contentType,
    size: bytes.length,
    objectPath,
    bytes,
  }
}

async function prepareFirstValidAsset(imageUrls, failures) {
  for (const imageUrl of imageUrls) {
    try {
      return await prepareAsset(imageUrl)
    } catch (error) {
      failures.push({ image_url: imageUrl, error: error.message })
    }
  }
  return null
}

async function uploadAsset(asset) {
  if (!asset) return
  const key = serviceRoleKey()
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to upload JOWiki images')
  const baseUrl = supabaseUrl().replace(/\/$/, '')
  const bucket = supabaseBucket()
  const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${asset.objectPath}`
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': asset.contentType,
      'x-upsert': 'false',
    },
    body: asset.bytes,
  })
  if (!response.ok) {
    const body = await response.text()
    if (response.status === 409 || /already exists|Duplicate/i.test(body)) return
    throw new Error(`Supabase Storage upload failed ${response.status}: ${body}`)
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
  e.content_hash as import_content_hash,
  a.id as attachment_id,
  a.filename as attachment_filename,
  a.file_type as attachment_file_type,
  a.file_path as attachment_file_path,
  a.file_size as attachment_file_size
from public.records r
join public.external_imports e on e.record_id = r.id
left join lateral (
  select id, filename, file_type, file_path, file_size
  from public.record_attachments
  where record_id = r.id
  order by created_at desc
  limit 1
) a on true
where r.schema_type = 'FAQ'
  and e.source_url like 'https://www.jostudy.de/jowiki/%'
  ${idClause}
order by r.id, e.imported_at desc;
`
  const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output', 'json', query], { encoding: 'utf8' })
  const parsed = JSON.parse(raw)
  const rows = parsed.rows || []
  return LIMIT > 0 ? rows.slice(0, LIMIT) : rows
}

function repairSql(item) {
  const deleteAttachmentSql = item.legacyAttachmentId ? `,
deleted_attachments as (
  delete from public.record_attachments
  where id = ${sql(item.legacyAttachmentId)}::uuid
    and record_id = ${sql(item.id)}::uuid
    and exists (select 1 from updated_record)
  returning id
)
` : ''
  const insertAttachmentSql = item.asset ? `,
inserted_attachment as (
  insert into public.record_attachments (id, record_id, filename, file_type, file_path, file_size, created_at)
  select ${sql(crypto.randomUUID())}::uuid, ${sql(item.id)}::uuid, ${sql(item.asset.filename)}, ${sql(item.asset.contentType)}, ${sql(item.asset.objectPath)}, ${sql(String(item.asset.size))}, now()
  where exists (select 1 from updated_record)
  returning id
)` : ''
  const attachmentSql = [deleteAttachmentSql, insertAttachmentSql].filter(Boolean).join('')

  return `
with updated_record as (
update public.records
set data_json = ${jsonSql(item.nextData)},
    completeness_score = 0.85,
    version = version + 1,
    updated_at = now()
where id = ${sql(item.id)}::uuid
  and status = 'needs_review'
  and (
    coalesce(data_json #>> '{_source,content_hash}', '') is distinct from ${sql(item.contentHash)}
    or ${item.forceAttachmentRepair ? 'true' : 'false'}
  )
returning id
),
updated_import as (
update public.external_imports
set content_hash = ${sql(item.contentHash)},
    details_json = coalesce(details_json, '{}'::jsonb) || ${jsonSql({
      action: 'jowiki_data_quality_repair',
      repaired_by: ACTOR,
      previous_content_hash: item.previousHash,
      source_url: item.sourceUrl,
      image_url: item.asset?.imageUrl || null,
      attachment_action: item.legacyAttachmentId ? (item.asset ? 'replaced_legacy' : 'removed_legacy_without_replacement') : (item.asset ? 'inserted_missing' : 'unchanged'),
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
)${attachmentSql}
insert into public.audit_logs (id, action, entity_type, entity_id, actor, details_json, timestamp)
select ${sql(crypto.randomUUID())}::uuid, 'jowiki_data_quality_repair', 'Record', ${sql(item.id)}::uuid, ${sql(ACTOR)}, ${jsonSql({
    source_url: item.sourceUrl,
    previous_content_hash: item.previousHash,
    content_hash: item.contentHash,
    image_url: item.asset?.imageUrl || null,
    attachment_action: item.legacyAttachmentId ? (item.asset ? 'replaced_legacy' : 'removed_legacy_without_replacement') : (item.asset ? 'inserted_missing' : 'unchanged'),
  })}, now()
where exists (select 1 from updated_record);
`
}

function hasLegacyCrawlerAttachment(row) {
  const currentSize = Number(row.attachment_file_size || 0)
  const filename = String(row.attachment_filename || '')
  return currentSize === 24849 || /^(0\d{2}|10\d)\.png$/i.test(filename)
}

async function main() {
  validateApplyConfig()
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
      const normalized = normalizeJowiki(row.source_url, html, current)
      const currentHash = current?._source?.content_hash || row.import_content_hash || null
      const currentAnswer = String(current.answer || current.description || current.content || '')
      const dirtyText = /(Direkt zum Inhalt|German English Login|Login\s*-->|Anmelden oder Registrieren|JOKARI GmbH)/i.test(currentAnswer)
      const shortOrEmpty = String(normalized.data.answer || '').length < 20
      const currentSize = Number(row.attachment_file_size || 0)
      const suspiciousImage = Boolean(row.attachment_id && hasLegacyCrawlerAttachment(row))
      const changed = normalized.contentHash !== currentHash
      const action = !shortOrEmpty && (changed || dirtyText || suspiciousImage) ? 'repair' : 'no_change'
      const imageFailures = []
      let asset = action === 'repair' && (suspiciousImage || !row.attachment_id)
        ? await prepareFirstValidAsset(normalized.imageUrls, imageFailures)
        : null
      if (
        asset
        && Number(row.attachment_file_size || 0) === asset.size
        && row.attachment_filename === asset.filename
      ) {
        asset = null
      }
      const legacyAttachmentId = action === 'repair' && suspiciousImage ? row.attachment_id : null
      const forceAttachmentRepair = Boolean(legacyAttachmentId)

      const entry = {
        id: row.id,
        primary_key: row.primary_key,
        source_url: row.source_url,
        action,
        previous_hash: currentHash,
        next_hash: normalized.contentHash,
        answer_before_chars: currentAnswer.length,
        answer_after_chars: String(normalized.data.answer || '').length,
        category: normalized.data.category,
        h5p_texts: normalized.textCount,
        h5p_images: normalized.imageCount,
        image_failures: imageFailures,
        previous_attachment_size: currentSize || null,
        next_attachment_size: asset?.size || null,
        next_attachment_filename: asset?.filename || null,
        attachment_action: legacyAttachmentId ? (asset ? 'replace_legacy' : 'remove_legacy_without_replacement') : (asset ? 'insert_missing' : 'unchanged'),
        reason: shortOrEmpty ? 'extracted_answer_too_short' : undefined,
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
          asset,
          legacyAttachmentId,
          forceAttachmentRepair,
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
    for (const repair of repairs) {
      if (repair.asset) await uploadAsset(repair.asset)
    }
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
