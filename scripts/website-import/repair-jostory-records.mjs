import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = process.env.OUT_DIR || '/tmp/jokari-jostory-repair'
const SQL_PATH = path.join(OUT_DIR, 'repair.sql')
const REPORT_PATH = path.join(OUT_DIR, 'report.json')
const ACTOR = 'jostory-repair-script'
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
    .replace(/&euro;/g, 'EUR')
    .replace(/\s+/g, ' ')
    .replace(/\bbzw\s+\./gi, 'bzw.')
    .replace(/\bz\.\s+B\s+\./gi, 'z. B.')
    .replace(/\bmm\s*2\b/g, 'mm²')
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

function firstCleanMatch(html, pattern) {
  return cleanText(html.match(pattern)?.[1] || '')
}

function articleHtml(html) {
  const start = html.search(/<div[^>]+class=["'][^"']*article__header/i)
  if (start < 0) return html
  const tail = html.slice(start)
  const end = tail.search(/<!--\s*related things\s*-->|<div[^>]+class=["'][^"']*news-backlink-wrap/i)
  return end > 0 ? tail.slice(0, end) : tail
}

function extractTables(html) {
  const tables = []
  for (const table of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows = []
    for (const row of table[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      const cells = [...row[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => cleanText(cell[1]))
        .filter(Boolean)
      if (cells.length) rows.push(cells.join(' | '))
    }
    if (rows.length) tables.push(rows.join('\n'))
  }
  return tables
}

function absoluteImageUrl(raw, baseUrl) {
  if (!raw) return null
  const first = String(raw).split(',')[0]?.trim()?.split(/\s+/)?.[0]
  if (!first) return null
  const resolved = new URL(first, baseUrl).href
  const pathname = new URL(resolved).pathname.toLowerCase()
  if (!pathname.match(/\.(jpe?g|png|webp)$/)) return null
  if (pathname.includes('favicon') || pathname.includes('logo') || pathname.includes('/icons/flags/') || pathname.includes('sprite')) return null
  return resolved
}

function articleImageUrls(html, baseUrl) {
  const block = articleHtml(html)
  const urls = []
  const seenKeys = new Set()
  const pushUrl = (raw) => {
    const imageUrl = absoluteImageUrl(raw, baseUrl)
    if (!imageUrl) return
    const key = imageIdentity(imageUrl)
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    urls.push(imageUrl)
  }
  for (const metaName of ['og:image', 'twitter:image']) {
    pushUrl(metaContent(html, metaName))
  }
  for (const picture of block.matchAll(/<picture\b[\s\S]*?<\/picture>/gi)) {
    let best = null
    for (const tag of picture[0].matchAll(/<(?:source|img)\b[^>]*>/gi)) {
      const srcset = tag[0].match(/\ssrcset=["']([^"']+)["']/i)?.[1]
      const src = tag[0].match(/\ssrc=["']([^"']+)["']/i)?.[1]
      const width = Number(tag[0].match(/\swidth=["']?(\d+)/i)?.[1] || 0)
      const raw = srcset || src
      if (!raw) continue
      if (!best || width > best.width) best = { raw, width }
    }
    pushUrl(best?.raw)
  }
  for (const match of block.matchAll(/<img\b[^>]*>/gi)) {
    pushUrl(
      match[0].match(/\ssrc=["']([^"']+)["']/i)?.[1] || match[0].match(/\ssrcset=["']([^"']+)["']/i)?.[1],
    )
  }
  return urls
}

function imageIdentity(url) {
  const basename = decodeURIComponent(new URL(url).pathname.split('/').pop() || url).toLowerCase()
  return basename
    .replace(/^csm_/, '')
    .replace(/_[a-f0-9]{8,}(?=\.[a-z0-9]+$)/i, '')
}

function relatedProducts(text) {
  const matches = text.match(/\b(?:JOKARI\s+)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9+-]*(?:\s+(?:No\.?\s*)?[A-ZÄÖÜ]?[A-Za-zÄÖÜäöüß0-9+-]+){0,3}\b/g) || []
  const blocked = new Set(['German', 'English', 'Login', 'Suchen', 'JOKARI GmbH', 'Direkt zum Inhalt', 'Hauptnavigation'])
  return [...new Set(matches.map((match) => match.trim()).filter((match) => {
    const lower = match.toLowerCase()
    return match.length >= 4 && !blocked.has(match) && ['jokari', 'secura', 'sensor', 'strip', 'kabelmesser', 'abisolierzange', 'entmanteler'].some((marker) => lower.includes(marker))
  }))].slice(0, 10)
}

function normalizeJostory(url, html, oldData) {
  const block = articleHtml(html)
  const title = firstCleanMatch(block, /<h1[^>]*itemprop=["']headline["'][^>]*>([\s\S]*?)<\/h1>/i) || titleFromHtml(html, url)
  const teaser = firstCleanMatch(block, /<div[^>]+class=["'][^"']*teaser-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || metaContent(html, 'description')
  const publishedAt = firstCleanMatch(block, /<time[^>]+itemprop=["']datePublished["'][^>]*datetime=["']([^"']+)["'][^>]*>/i)
  const modifiedAt = firstCleanMatch(block, /<meta[^>]+itemprop=["']dateModified["'][^>]*content=["']([^"']+)["'][^>]*>/i)
  const category = firstCleanMatch(block, /<span[^>]+class=["'][^"']*news-list-category[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || 'JO!STORY'
  const author = firstCleanMatch(block, /<span[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i)
  const sections = []
  const headings = []
  const captions = []

  for (const sectionMatch of block.matchAll(/<section\b[\s\S]*?<\/section>/gi)) {
    const section = sectionMatch[0]
    const heading = firstCleanMatch(section, /<h2[^>]*>([\s\S]*?)<\/h2>/i)
    const paragraphs = [...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean)
      .filter((part) => !/^Zurück\b/i.test(part))
      .filter((part) => !/^Das könnte Sie auch interessieren\b/i.test(part))
    const tables = extractTables(section)
    const sectionCaptions = [...section.matchAll(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean)
    const parts = [heading, ...paragraphs, ...tables.map((table) => `Tabelle:\n${table}`), ...sectionCaptions.map((caption) => `Bild: ${caption}`)].filter(Boolean)
    if (!parts.length) continue
    if (heading) headings.push(heading)
    captions.push(...sectionCaptions)
    sections.push(parts.join('\n\n'))
  }

  const content = [teaser, ...sections].filter(Boolean).join('\n\n').trim()
  const imageUrls = articleImageUrls(html, url)
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
    title,
    version: oldData?.version || 'website-import-2026-04-27',
    content,
    objectives: Array.isArray(oldData?.objectives) ? oldData.objectives : [],
    target_audience: oldData?.target_audience || 'Vertrieb, Support und Wissensnutzer',
    product_category: category,
    key_points: [teaser, ...headings].filter(Boolean).slice(0, 8),
    related_products: relatedProducts(content),
    summary: teaser || null,
    author: author || null,
    published_at: publishedAt || null,
    modified_at: modifiedAt || null,
    article_images: imageUrls,
    image_captions: captions,
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
    evidence: content.slice(0, 1000),
    imageUrls,
    headingCount: headings.length,
    imageCount: imageUrls.length,
  }
}

function fileNameFromUrl(url) {
  return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'jostory-image.jpg')
}

function extensionFromContentType(contentType, fallbackName) {
  if (contentType.includes('png')) return '.png'
  if (contentType.includes('webp')) return '.webp'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg'
  return path.extname(fallbackName) || '.jpg'
}

async function prepareAsset(imageUrl) {
  const hostname = new URL(imageUrl).hostname
  if (hostname !== 'jokari.de' && hostname !== 'www.jokari.de') {
    throw new Error(`Refusing non-JOKARI image host: ${hostname}`)
  }
  const response = await fetch(imageUrl, { redirect: 'follow' })
  if (!response.ok) throw new Error(`image ${imageUrl} returned HTTP ${response.status}`)
  const finalHostname = new URL(response.url).hostname
  if (finalHostname !== 'jokari.de' && finalHostname !== 'www.jokari.de') {
    throw new Error(`Refusing redirected non-JOKARI image host: ${finalHostname}`)
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  if (!contentType.startsWith('image/')) throw new Error(`${imageUrl} is not an image`)
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_IMAGE_BYTES) throw new Error(`${imageUrl} is too large (${contentLength} bytes)`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`${imageUrl} is too large (${bytes.length} bytes)`)
  const filename = fileNameFromUrl(imageUrl)
  const extension = extensionFromContentType(contentType, filename)
  const imageHash = crypto.createHash('sha256').update(bytes).digest('hex')
  return {
    imageUrl,
    filename,
    contentType,
    size: bytes.length,
    objectPath: `documents/jostory-${imageHash}${extension}`,
    bytes,
  }
}

async function prepareAssets(imageUrls, existingFilePaths, failures) {
  const assets = []
  for (const imageUrl of imageUrls) {
    try {
      const asset = await prepareAsset(imageUrl)
      if (!existingFilePaths.has(asset.objectPath)) assets.push(asset)
    } catch (error) {
      failures.push({ image_url: imageUrl, error: error.message })
    }
  }
  return assets
}

async function uploadAsset(asset) {
  const key = serviceRoleKey()
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to upload JO!STORY images')
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
select
  r.id,
  r.status,
  r.schema_type,
  r.primary_key,
  r.data_json,
  e.id as external_import_id,
  e.source_url,
  e.source_id,
  e.content_hash as import_content_hash,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id::text,
        'filename', a.filename,
        'file_type', a.file_type,
        'file_path', a.file_path,
        'file_size', a.file_size
      )
      order by a.created_at
    ) filter (where a.id is not null),
    '[]'::jsonb
  ) as attachments
from public.records r
join (
  select distinct on (record_id)
    id,
    record_id,
    source_url,
    source_id,
    content_hash,
    imported_at
  from public.external_imports
  where source_url like 'https://jokari.de/wissen/blog-jostory/detail/%'
  order by record_id, imported_at desc, id desc
) e on e.record_id = r.id
left join public.record_attachments a on a.record_id = r.id
where r.schema_type = 'TrainingModule'
  ${idClause}
group by r.id, e.id, e.source_url, e.source_id, e.content_hash
order by e.source_url;
`
  const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output', 'json', query], { encoding: 'utf8' })
  const parsed = JSON.parse(raw)
  const rows = parsed.rows || []
  return LIMIT > 0 ? rows.slice(0, LIMIT) : rows
}

function duplicateImportExists(sourceId, contentHash, currentImportId) {
  const query = `
select exists (
  select 1
  from public.external_imports
  where source_id = ${sql(sourceId)}
    and content_hash = ${sql(contentHash)}
    and id <> ${sql(currentImportId)}::uuid
) as duplicate_exists;
`
  const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output', 'json', query], { encoding: 'utf8' })
  const parsed = JSON.parse(raw)
  return Boolean(parsed.rows?.[0]?.duplicate_exists)
}

function suspiciousAttachment(attachment) {
  const filename = String(attachment.filename || '')
  const filePath = String(attachment.file_path || '')
  const size = Number(attachment.file_size || 0)
  if (filePath.includes('/jostory-')) return false
  return /^(0\d{2}|10\d)\.(?:jpe?g|png|webp)$/i.test(filename) || (size > 0 && size < 25000)
}

function repairSql(item) {
  const forceUpdate = item.forceUpdate ? 'true' : 'false'
  const deleteAttachmentSql = item.deleteAttachmentIds.length ? `,
deleted_attachments as (
  delete from public.record_attachments
  where record_id = ${sql(item.id)}::uuid
    and id in (${item.deleteAttachmentIds.map((id) => `${sql(id)}::uuid`).join(', ')})
    and exists (select 1 from updated_record)
  returning id
)
` : ''
  const insertAttachmentSql = item.assets.length ? `,
inserted_attachments as (
  insert into public.record_attachments (id, record_id, filename, file_type, file_path, file_size, created_at)
  select v.id::uuid, ${sql(item.id)}::uuid, v.filename, v.file_type, v.file_path, v.file_size, now()
  from (values
    ${item.assets.map((asset) => `(${sql(crypto.randomUUID())}, ${sql(asset.filename)}, ${sql(asset.contentType)}, ${sql(asset.objectPath)}, ${sql(String(asset.size))})`).join(',\n    ')}
  ) as v(id, filename, file_type, file_path, file_size)
  where exists (select 1 from updated_record)
    and not exists (
      select 1 from public.record_attachments existing
      where existing.record_id = ${sql(item.id)}::uuid
        and existing.file_path = v.file_path
    )
  returning id
)
` : ''
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
    or ${forceUpdate}
  )
returning id
),
updated_import as (
update public.external_imports
set content_hash = ${sql(item.contentHash)},
    details_json = coalesce(details_json, '{}'::jsonb) || ${jsonSql({
      action: 'jostory_data_quality_repair',
      repaired_by: ACTOR,
      previous_content_hash: item.previousHash,
      source_url: item.sourceUrl,
      image_urls: item.assets.map((asset) => asset.imageUrl),
      deleted_attachment_ids: item.deleteAttachmentIds,
      inserted_attachments: item.assets.map((asset) => asset.objectPath),
    })},
    imported_at = now()
where id = ${sql(item.externalImportId)}::uuid
  and exists (select 1 from updated_record)
  and not exists (
    select 1
    from public.external_imports duplicate
    where duplicate.id <> public.external_imports.id
      and duplicate.source_type = public.external_imports.source_type
      and duplicate.source_id = public.external_imports.source_id
      and duplicate.content_hash = ${sql(item.contentHash)}
  )
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
select ${sql(crypto.randomUUID())}::uuid, 'jostory_data_quality_repair', 'Record', ${sql(item.id)}::uuid, ${sql(ACTOR)}, ${jsonSql({
    source_url: item.sourceUrl,
    previous_content_hash: item.previousHash,
    content_hash: item.contentHash,
    image_urls: item.assets.map((asset) => asset.imageUrl),
    deleted_attachment_ids: item.deleteAttachmentIds,
    inserted_attachments: item.assets.map((asset) => asset.objectPath),
  })}, now()
where exists (select 1 from updated_record);
`
}

async function main() {
  validateApplyConfig()
  await fs.mkdir(OUT_DIR, { recursive: true })
  const rows = await fetchRows()
  const report = []
  const repairs = []

  for (const row of rows) {
    const current = row.data_json || {}
    const attachments = Array.isArray(row.attachments) ? row.attachments : []
    if (row.status !== 'needs_review') {
      report.push({ id: row.id, source_url: row.source_url, status: row.status, action: 'skipped_non_review' })
      continue
    }

    try {
      const response = await fetch(row.source_url, { redirect: 'follow' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const finalHostname = new URL(response.url).hostname
      if (finalHostname !== 'jokari.de' && finalHostname !== 'www.jokari.de') {
        throw new Error(`Refusing redirected non-JOKARI page host: ${finalHostname}`)
      }
      const html = await response.text()
      const normalized = normalizeJostory(row.source_url, html, current)
      const currentHash = current?._source?.content_hash || row.import_content_hash || null
      const currentContent = String(current.content || current.description || '')
      const dirtyText = /(Hauptnavigation|Zum Inhalt springen|JOKARI homepage|Merkliste|Zur Navigation am Seitenende|JOKARI GmbH|Impressum)/i.test(currentContent)
      const shortOrEmpty = normalized.data.content.length < 120
      const existingFilePaths = new Set(attachments.map((attachment) => attachment.file_path).filter(Boolean))
      const suspiciousAttachments = attachments.filter(suspiciousAttachment)
      const imageFailures = []
      const changed = normalized.contentHash !== currentHash
      const duplicateImport = changed ? duplicateImportExists(row.source_id, normalized.contentHash, row.external_import_id) : false
      const action = duplicateImport
        ? 'skipped_duplicate_import'
        : (!shortOrEmpty && (changed || dirtyText || suspiciousAttachments.length > 0 || attachments.length < normalized.imageUrls.length) ? 'repair' : 'no_change')
      const assets = action === 'repair'
        ? await prepareAssets(normalized.imageUrls, existingFilePaths, imageFailures)
        : []
      const deleteAttachmentIds = action === 'repair' ? suspiciousAttachments.map((attachment) => attachment.id) : []
      const forceUpdate = deleteAttachmentIds.length > 0 || assets.length > 0

      const entry = {
        id: row.id,
        primary_key: row.primary_key,
        source_url: row.source_url,
        action,
        previous_hash: currentHash,
        next_hash: normalized.contentHash,
        content_before_chars: currentContent.length,
        content_after_chars: normalized.data.content.length,
        headings: normalized.headingCount,
        source_images: normalized.imageCount,
        current_attachments: attachments.length,
        delete_attachments: deleteAttachmentIds.length,
        insert_attachments: assets.length,
        image_failures: imageFailures,
        reason: shortOrEmpty ? 'extracted_content_too_short' : (duplicateImport ? 'duplicate_target_import_hash' : undefined),
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
          assets,
          deleteAttachmentIds,
          forceUpdate,
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
      for (const asset of repair.assets) {
        await uploadAsset(asset)
      }
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
