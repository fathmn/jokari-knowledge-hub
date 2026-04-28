import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = process.env.OUT_DIR || '/tmp/jokari-delta-source-repair'
const ASSET_DIR = path.join(OUT_DIR, 'assets')
const SQL_PATH = path.join(OUT_DIR, 'repair.sql')
const REPORT_PATH = path.join(OUT_DIR, 'report.json')
const PAYLOAD_PATH = path.join(OUT_DIR, 'payload.json')
const APPLY = process.argv.includes('--apply')
const ACTOR = 'delta-source-repair-script'
const SOURCE_TYPE = 'crawlee'
const SOURCE_VERSION = 'website-delta-repair-2026-04-28'
const DEFAULT_SUPABASE_URL = 'https://gqezmqopvjvpdnknmfap.supabase.co'
const DEFAULT_BUCKET = 'documents'
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_JOWIKI_PAGES = Number(process.env.MAX_JOWIKI_PAGES || '20')

const ALLOWED_HOSTS = new Set(['jokari.de', 'www.jokari.de', 'jostudy.de', 'www.jostudy.de'])

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

function sql(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function jsonSql(value) {
  return `${sql(JSON.stringify(value))}::jsonb`
}

function uuid() {
  return crypto.randomUUID()
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    )
  }
  return value
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function envFileValue(key) {
  try {
    const raw = execFileSync('sed', ['-n', `s/^${key}=//p`, 'backend/.env'], { encoding: 'utf8' }).trim()
    return raw || ''
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
  const ref = linkedProjectRef()
  if (ref && supabaseUrl() !== DEFAULT_SUPABASE_URL && !supabaseUrl().includes(ref)) {
    throw new Error(`Supabase URL does not match linked project ref ${ref}`)
  }
}

function validateAllowedUrl(url, label = 'url') {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} must use http/https`)
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`${label} host is not allowed: ${parsed.hostname}`)
}

async function fetchText(url) {
  validateAllowedUrl(url, 'page url')
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  validateAllowedUrl(response.url, 'final page url')
  return await response.text()
}

function titleFromHtml(html, url) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const raw = cleanText(h1 || title || '')
  return raw ? raw.split('|')[0].trim() : new URL(url).pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')
}

function extractLinks(html, baseUrl) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .flatMap((match) => {
      try {
        const url = new URL(match[1], baseUrl).href
        validateAllowedUrl(url, 'link url')
        return [{ url, text: cleanText(match[2]) }]
      } catch {
        return []
      }
    })
}

function extractProductDownloads(html, baseUrl) {
  const fileExt = /\.(pdf|zip|docx?|xlsx?|pptx?|stl)(?:[?#]|$)/i
  const downloadText = /\b(download|datenblatt|bedienungsanleitung|anleitung|pdf|produktblatt|katalog|technische daten|3d|ersatzteile)\b/i
  const blockedPath = /\/(kontakt|wissen|unternehmen|service\/downloads)(?:\/|$)/i
  const downloads = []

  for (const link of extractLinks(html, baseUrl)) {
    const parsed = new URL(link.url)
    const pathname = parsed.pathname
    if (blockedPath.test(pathname)) continue
    if (!fileExt.test(pathname) && !downloadText.test(link.text)) continue
    const extension = (pathname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
    if (!extension || !['pdf', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'stl'].includes(extension)) continue
    downloads.push({ url: link.url, label: link.text || path.basename(pathname), extension })
  }

  return [...new Map(downloads.map((item) => [item.url, item])).values()]
}

function mimeFromExtension(extension, responseType) {
  if (responseType && responseType !== 'application/octet-stream') return responseType.split(';')[0].trim()
  const map = {
    pdf: 'application/pdf',
    zip: 'application/zip',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    stl: 'model/stl',
  }
  return map[extension] || 'application/octet-stream'
}

function filenameFromUrl(url) {
  const name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'download')
  return name.replace(/[^\w.\- äöüÄÖÜß]/g, '_')
}

async function prepareFileAsset(download) {
  validateAllowedUrl(download.url, 'download url')
  const response = await fetch(download.url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${download.url} returned HTTP ${response.status}`)
  validateAllowedUrl(response.url, 'final download url')
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_FILE_BYTES) throw new Error(`${download.url} is too large (${contentLength} bytes)`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`${download.url} is too large (${bytes.length} bytes)`)
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const filename = filenameFromUrl(download.url)
  const extension = download.extension || path.extname(filename).slice(1).toLowerCase()
  const objectPath = response.url
  const localPath = path.join(ASSET_DIR, `${hash}.${extension || 'bin'}`)
  await fs.writeFile(localPath, bytes)
  return {
    ...download,
    finalUrl: response.url,
    filename,
    contentType: mimeFromExtension(extension, response.headers.get('content-type') || ''),
    size: bytes.length,
    sha256: hash,
    objectPath,
    localPath,
    bytes,
  }
}

async function uploadAsset(asset) {
  if (asset.objectPath.startsWith('http://') || asset.objectPath.startsWith('https://')) return
  const key = serviceRoleKey()
  const uploadUrl = `${supabaseUrl().replace(/\/$/, '')}/storage/v1/object/${supabaseBucket()}/${asset.objectPath}`
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

async function listProductUrls() {
  const sitemap = await fetchText('https://jokari.de/sitemap.xml')
  return [...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter((url) => url.includes('/produkte/detail/'))
    .sort()
}

async function productDownloadRepairs() {
  const urls = await listProductUrls()
  const report = []
  const repairs = []

  for (const url of urls) {
    try {
      const html = await fetchText(url)
      const downloads = extractProductDownloads(html, url)
      const assets = []
      const failures = []

      for (const download of downloads) {
        try {
          const asset = await prepareFileAsset(download)
          assets.push(asset)
        } catch (error) {
          failures.push({ url: download.url, label: download.label, error: error.message })
        }
      }

      report.push({
        source_url: url,
        expected_downloads: downloads.length,
        candidate_downloads: assets.length,
        failures,
        action: assets.length ? 'insert_download_attachments' : 'no_change',
      })

      if (assets.length) {
        repairs.push({
          sourceUrl: url,
          assets,
        })
      }
    } catch (error) {
      report.push({ source_url: url, action: 'failed', error: error.message })
    }
  }

  return { rows: urls.length, repairs, report }
}

function productDownloadSql(item) {
  const values = item.assets.map((asset) => `(${sql(uuid())}::uuid, ${sql(asset.filename)}, ${sql(asset.contentType)}, ${sql(asset.objectPath)}, ${sql(String(asset.size))}, ${sql(asset.url)}, ${sql(asset.sha256)}, now())`).join(',\n')
  return `
with selected_record as (
  select r.id as record_id, e.id as external_import_id, r.primary_key
  from public.external_imports e
  join public.records r on r.id = e.record_id
  where e.source_url = ${sql(item.sourceUrl)}
    and r.schema_type = 'ProductSpec'
    and r.status = 'needs_review'
  order by e.imported_at desc
  limit 1
),
candidate_attachments(id, filename, file_type, file_path, file_size, source_url, content_hash, created_at) as (
  values
${values}
),
inserted_attachments as (
  insert into public.record_attachments (id, record_id, filename, file_type, file_path, file_size, source_url, content_hash, created_at)
  select c.id, selected_record.record_id, c.filename, c.file_type, c.file_path, c.file_size, c.source_url, c.content_hash, c.created_at
  from candidate_attachments c
  cross join selected_record
  where not exists (
    select 1 from public.record_attachments existing
    where existing.record_id = selected_record.record_id
      and (existing.file_path = c.file_path or existing.filename = c.filename)
  )
  returning id, filename, file_type, file_path, file_size
),
updated_import as (
  update public.external_imports
  set details_json = coalesce(details_json, '{}'::jsonb) || ${jsonSql({
    action: 'product_download_delta_repair',
    repaired_by: ACTOR,
    source_url: item.sourceUrl,
    downloads: item.assets.map((asset) => ({
      label: asset.label,
      source_url: asset.url,
      final_url: asset.finalUrl,
      filename: asset.filename,
      file_type: asset.contentType,
      file_path: asset.objectPath,
      file_size: asset.size,
      sha256: asset.sha256,
    })),
  })},
      imported_at = now()
  where id = (select external_import_id from selected_record)
    and exists (select 1 from inserted_attachments)
  returning id
)
insert into public.audit_logs (id, action, entity_type, entity_id, actor, details_json, timestamp)
select ${sql(uuid())}::uuid, 'product_download_delta_repair', 'Record', selected_record.record_id, ${sql(ACTOR)}, ${jsonSql({
    source_url: item.sourceUrl,
    inserted_downloads: item.assets.length,
    downloads: item.assets.map((asset) => ({
      source_url: asset.url,
      filename: asset.filename,
      file_type: asset.contentType,
      file_path: asset.objectPath,
      sha256: asset.sha256,
    })),
  })} || jsonb_build_object('primary_key', selected_record.primary_key), now()
from selected_record
where exists (select 1 from inserted_attachments);
`
}

function extractFieldText(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<div[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'))
  return cleanRichText(match?.[1] || '')
}

function extractFieldItems(html, className) {
  const match = className === 'field-kategorie'
    ? html.match(/<div[^>]+class=["'][^"']*field-kategorie[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["'][^"']*field-interaktiver-inhalt/i)
    : html.match(new RegExp(`<div[^>]+class=["'][^"']*${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'))
  if (!match) return []
  return [...match[1].matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map((item) => cleanText(item[1])).filter(Boolean)
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
      if (filePath) result.images.push(new URL(`/sites/default/files/h5p/content/${contentId}/${filePath}`, baseUrl).href)
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

function relatedProducts(text) {
  const matches = text.match(/\b(?:JOKARI\s+)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9+-]*(?:\s+(?:No\.?\s*)?[A-ZÄÖÜ]?[A-Za-zÄÖÜäöüß0-9+-]+){0,3}\b/g) || []
  const blocked = new Set(['German', 'English', 'Login', 'Suchen', 'JOKARI GmbH', 'Direkt zum Inhalt'])
  return [...new Set(matches.map((match) => match.trim()).filter((match) => {
    const lower = match.toLowerCase()
    return match.length >= 4 && !blocked.has(match) && ['jokari', 'secura', 'sensor', 'strip', 'kabelmesser', 'abisolierzange', 'entmanteler'].some((marker) => lower.includes(marker))
  }))].slice(0, 10)
}

function normalizeJowiki(url, html) {
  const title = titleFromHtml(html, url)
  const h5p = extractH5PContent(html, url)
  const intro = extractFieldText(html, 'field-beschreibung')
  const categories = extractFieldItems(html, 'field-kategorie')
  const answer = [intro, ...h5p.texts].filter(Boolean).join('\n\n').trim()
  if (answer.length < 20) {
    return { skip_reason: 'no_structured_jowiki_content', title, h5p }
  }
  const dataWithoutSource = {
    question: title,
    answer: answer.slice(0, 6000),
    category: categories.join(' / ') || 'JO!Wiki',
    related_products: relatedProducts(answer),
  }
  const contentHash = sha256(dataWithoutSource)
  const source = {
    source_type: SOURCE_TYPE,
    source_id: `${SOURCE_TYPE}:${url}`,
    source_url: url,
    api_endpoint: null,
    source_version: SOURCE_VERSION,
    trust_type: 'unauthenticated_public',
    authenticated_source: false,
    content_hash: contentHash,
    imported_at: new Date().toISOString(),
  }
  return {
    title,
    primaryKey: title,
    data: { ...dataWithoutSource, _source: source },
    contentHash,
    source,
    evidence: answer.slice(0, 1000),
    imageUrls: h5p.images,
    h5pTextCount: h5p.texts.length,
    h5pImageCount: h5p.images.length,
  }
}

async function listJowikiUrls() {
  const urls = []
  let emptyPages = 0
  for (let page = 0; page <= MAX_JOWIKI_PAGES; page += 1) {
    const url = page === 0 ? 'https://www.jostudy.de/jowiki' : `https://www.jostudy.de/jowiki?page=${page}`
    const html = await fetchText(url)
    const before = urls.length
    for (const link of extractLinks(html, 'https://www.jostudy.de/jowiki')) {
      const parsed = new URL(link.url)
      if (parsed.hostname === 'www.jostudy.de' && parsed.pathname.startsWith('/jowiki/') && !parsed.search) {
        if (!urls.includes(link.url)) urls.push(link.url)
      }
    }
    if (urls.length === before) emptyPages += 1
    else emptyPages = 0
    if (emptyPages >= 2) break
  }
  return urls
}

async function jowikiMissingRepairs() {
  const sourceUrls = await listJowikiUrls()
  const missingUrls = sourceUrls.sort()
  const report = []
  const repairs = []

  for (const url of missingUrls) {
    try {
      const html = await fetchText(url)
      const normalized = normalizeJowiki(url, html)
      if (normalized.skip_reason) {
        report.push({ url, action: 'skipped', reason: normalized.skip_reason })
        continue
      }
      const assets = []
      const failures = []
      for (const imageUrl of normalized.imageUrls) {
        try {
          assets.push(await prepareFileAsset({ url: imageUrl, label: 'H5P image', extension: path.extname(new URL(imageUrl).pathname).slice(1).toLowerCase() || 'jpg' }))
        } catch (error) {
          failures.push({ url: imageUrl, error: error.message })
        }
      }
      const item = {
        url,
        normalized,
        recordId: uuid(),
        importId: uuid(),
        evidenceId: uuid(),
        updateId: uuid(),
        auditId: uuid(),
        assets,
      }
      repairs.push(item)
      report.push({
        url,
        action: 'insert_missing_jowiki_record',
        primary_key: normalized.primaryKey,
        answer_chars: normalized.data.answer.length,
        h5p_texts: normalized.h5pTextCount,
        h5p_images: normalized.h5pImageCount,
        attachments: assets.length,
        image_failures: failures,
      })
    } catch (error) {
      report.push({ url, action: 'failed', error: error.message })
    }
  }

  return { sourceUrls: sourceUrls.length, missingUrls: missingUrls.length, repairs, report }
}

function jowikiInsertSql(item) {
  const recordId = sql(item.recordId)
  const importId = sql(item.importId)
  const evidenceId = sql(item.evidenceId)
  const updateId = sql(item.updateId)
  const auditId = sql(item.auditId)
  const n = item.normalized
  const attachmentCte = item.assets.length ? `
,
candidate_attachments(id, filename, file_type, file_path, file_size, source_url, content_hash, created_at) as (
  values
${item.assets.map((asset) => `(${sql(uuid())}::uuid, ${sql(asset.filename)}, ${sql(asset.contentType)}, ${sql(asset.objectPath)}, ${sql(String(asset.size))}, ${sql(asset.url)}, ${sql(asset.sha256)}, now())`).join(',\n')}
),
inserted_attachments as (
  insert into public.record_attachments (id, record_id, filename, file_type, file_path, file_size, source_url, content_hash, created_at)
  select c.id, selected.record_id, c.filename, c.file_type, c.file_path, c.file_size, c.source_url, c.content_hash, c.created_at
  from candidate_attachments c
  cross join selected
  where exists (select 1 from inserted_record)
    and not exists (
      select 1 from public.record_attachments existing
      where existing.record_id = selected.record_id
        and existing.file_path = c.file_path
    )
  returning id
)` : ''

  return `
with existing_import as (
  select record_id from public.external_imports
  where source_url = ${sql(item.url)}
     or (source_type = ${sql(SOURCE_TYPE)} and source_id = ${sql(n.source.source_id)})
),
existing_record as (
  select id as record_id, data_json
  from public.records
  where schema_type = 'FAQ'
    and primary_key = ${sql(n.primaryKey)}
  order by updated_at desc
  limit 1
),
existing_same_content as (
  select record_id
  from existing_record
  where data_json #>> '{_source,content_hash}' = ${sql(n.contentHash)}
),
inserted_record as (
  insert into public.records (id, document_id, department, schema_type, primary_key, data_json, completeness_score, status, version, created_at, updated_at)
  select ${recordId}::uuid, null, 'support', 'FAQ', ${sql(n.primaryKey)}, ${jsonSql(n.data)}, 0.85, 'needs_review', 1, now(), now()
  where not exists (select 1 from existing_import)
    and not exists (select 1 from existing_record)
  returning id as record_id
),
selected as (
  select record_id from inserted_record
  union all
  select record_id from existing_record where not exists (select 1 from inserted_record)
  union all
  select record_id from existing_import where record_id is not null
  limit 1
),
inserted_update as (
  insert into public.proposed_updates (id, record_id, source_document_id, new_data_json, diff_json, status, created_at)
  select ${updateId}::uuid, existing_record.record_id, null, ${jsonSql(n.data)},
    jsonb_build_object(
      'added', '{}'::jsonb,
      'removed', '{}'::jsonb,
      'changed', jsonb_build_object('data_json', jsonb_build_object('old', existing_record.data_json, 'new', ${jsonSql(n.data)})),
      'unchanged', '{}'::jsonb
    ),
    'pending',
    now()
  from existing_record
  where not exists (select 1 from existing_import)
    and not exists (select 1 from existing_same_content)
  returning id
),
inserted_import as (
  insert into public.external_imports (id, source_type, source_id, source_url, api_endpoint, trust_type, content_hash, source_version, authenticated_actor, status, record_id, details_json, imported_at)
  select ${importId}::uuid, ${sql(SOURCE_TYPE)}, ${sql(n.source.source_id)}, ${sql(item.url)}, null, 'unauthenticated_public', ${sql(n.contentHash)}, ${sql(SOURCE_VERSION)}, null,
    case when exists (select 1 from existing_same_content) then 'skipped_duplicate' else 'needs_review' end,
    selected.record_id,
    ${jsonSql({
      schema_type: 'FAQ',
      primary_key: n.primaryKey,
      imported_by: ACTOR,
      action: 'jowiki_pagination_delta_repair',
      h5p_texts: n.h5pTextCount,
      h5p_images: n.h5pImageCount,
      attachment_sources: item.assets.map((asset) => ({ source_url: asset.url, file_path: asset.objectPath, sha256: asset.sha256 })),
    })},
    now()
  from selected
  where not exists (select 1 from existing_import)
),
inserted_evidence as (
  insert into public.evidence (id, record_id, chunk_id, field_path, excerpt, start_offset, end_offset)
  select ${evidenceId}::uuid, selected.record_id, null, '_source', ${sql(n.evidence)}, null, null
  from selected
  where exists (select 1 from inserted_record)
)
${attachmentCte}
,
inserted_audit as (
  insert into public.audit_logs (id, action, entity_type, entity_id, actor, details_json, timestamp)
  select ${auditId}::uuid,
    case
      when exists (select 1 from inserted_record) then 'jowiki_pagination_delta_repair'
      when exists (select 1 from inserted_update) then 'jowiki_pagination_delta_proposed_update'
      else 'jowiki_pagination_delta_duplicate'
    end,
    'Record',
    selected.record_id,
    ${sql(ACTOR)},
    ${jsonSql({
      source_url: item.url,
      source_type: SOURCE_TYPE,
      trust_type: 'unauthenticated_public',
      content_hash: n.contentHash,
      attachments: item.assets.map((asset) => ({ source_url: asset.url, file_path: asset.objectPath, sha256: asset.sha256 })),
    })},
    now()
  from selected
  where not exists (select 1 from existing_import)
)
select 1;
`
}

async function main() {
  validateApplyConfig()
  await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(ASSET_DIR, { recursive: true })

  const productDownloads = await productDownloadRepairs()
  const jowikiMissing = await jowikiMissingRepairs()
  const productSql = productDownloads.repairs.map(productDownloadSql)
  const jowikiSql = jowikiMissing.repairs.map(jowikiInsertSql)
  await fs.writeFile(SQL_PATH, `begin;\n${[...productSql, ...jowikiSql].join('\n')}\ncommit;\n`)
  await fs.writeFile(REPORT_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    apply: APPLY,
    product_downloads: {
      rows: productDownloads.rows,
      repairs: productDownloads.repairs.length,
      missing_download_attachments: productDownloads.repairs.reduce((sum, item) => sum + item.assets.length, 0),
      report: productDownloads.report,
    },
    jowiki_missing: {
      source_urls: jowikiMissing.sourceUrls,
      missing_urls: jowikiMissing.missingUrls,
      repairs: jowikiMissing.repairs.length,
      attachment_inserts: jowikiMissing.repairs.reduce((sum, item) => sum + item.assets.length, 0),
      report: jowikiMissing.report,
    },
  }, null, 2))
  await fs.writeFile(PAYLOAD_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    source_version: SOURCE_VERSION,
    actor: ACTOR,
    product_downloads: productDownloads.repairs.map((repair) => ({
      source_url: repair.sourceUrl,
      assets: repair.assets.map((asset) => ({
        label: asset.label,
        url: asset.url,
        final_url: asset.finalUrl,
        filename: asset.filename,
        content_type: asset.contentType,
        file_path: asset.objectPath,
        file_size: String(asset.size),
        sha256: asset.sha256,
      })),
    })),
    jowiki_records: jowikiMissing.repairs.map((repair) => ({
      url: repair.url,
      record_id: repair.recordId,
      import_id: repair.importId,
      evidence_id: repair.evidenceId,
      update_id: repair.updateId,
      audit_id: repair.auditId,
      primary_key: repair.normalized.primaryKey,
      content_hash: repair.normalized.contentHash,
      data_json: repair.normalized.data,
      evidence: repair.normalized.evidence,
      h5p_texts: repair.normalized.h5pTextCount,
      h5p_images: repair.normalized.h5pImageCount,
      assets: repair.assets.map((asset) => ({
        id: uuid(),
        label: asset.label,
        url: asset.url,
        final_url: asset.finalUrl,
        filename: asset.filename,
        content_type: asset.contentType,
        file_path: asset.objectPath,
        file_size: String(asset.size),
        sha256: asset.sha256,
      })),
    })),
  }, null, 2))

  if (APPLY) {
    for (const repair of productDownloads.repairs) {
      for (const asset of repair.assets) await uploadAsset(asset)
    }
    for (const repair of jowikiMissing.repairs) {
      for (const asset of repair.assets) await uploadAsset(asset)
    }
    if (productSql.length || jowikiSql.length) {
      execFileSync('supabase', ['db', 'query', '--linked', '--file', SQL_PATH], { stdio: 'inherit' })
    }
  }

  console.log(JSON.stringify({
    applied: APPLY,
    out_dir: OUT_DIR,
    sql_path: SQL_PATH,
    report_path: REPORT_PATH,
    payload_path: PAYLOAD_PATH,
    product_records_scanned: productDownloads.rows,
    product_records_with_missing_downloads: productDownloads.repairs.length,
    missing_product_download_attachments: productDownloads.repairs.reduce((sum, item) => sum + item.assets.length, 0),
    jowiki_source_urls: jowikiMissing.sourceUrls,
    jowiki_missing_urls: jowikiMissing.missingUrls,
    jowiki_records_to_insert: jowikiMissing.repairs.length,
    jowiki_attachments_to_insert: jowikiMissing.repairs.reduce((sum, item) => sum + item.assets.length, 0),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
