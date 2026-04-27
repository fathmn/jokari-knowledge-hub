import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const OUT_DIR = process.env.OUT_DIR || '/tmp/jokari-website-import'
const ASSET_DIR = path.join(OUT_DIR, 'assets')
const SQL_PATH = path.join(OUT_DIR, 'import.sql')
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json')

const JOKARI_SITEMAP = 'https://jokari.de/sitemap.xml'
const JOSTUDY_JOWIKI = 'https://www.jostudy.de/jowiki'
const SOURCE_TYPE = 'crawlee'
const ACTOR = 'website-import-script'
const DEFAULT_SUPABASE_URL = 'https://gqezmqopvjvpdnknmfap.supabase.co'
const DEFAULT_BUCKET = 'documents'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const UPLOAD_ASSETS = process.argv.includes('--upload-assets') || process.env.UPLOAD_ASSETS === '1'
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
    .replace(/\bbzw\s+\./gi, 'bzw.')
    .replace(/\bz\.\s+B\s+\./gi, 'z. B.')
    .replace(/\bmm\s*2\b/g, 'mm²')
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

function metaContent(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escaped}["'])[^>]*content=["']([^"']+)["'][^>]*>`, 'i'))
  return cleanText(match?.[1] || '')
}

function cleanWebsiteText(value) {
  let text = cleanText(value)
  const contentMarkers = [
    'Geschichte der Kabelentwicklung:',
    'Kabelbearbeitung:',
    'Isolierstoffe:',
    'Werkzeugkunde:',
  ]
  for (const marker of contentMarkers) {
    const index = text.indexOf(marker)
    if (index > 0) {
      text = text.slice(index).trim()
      break
    }
  }
  const cutPatterns = [
    /\s*\|\s*JOKARI\b/i,
    /\bDirekt zum Inhalt\b/i,
    /\bGerman English Login\b/i,
    /\bLogin\s*-->/i,
    /\bSuchen\s*-->/i,
    /\bAnmelden oder Registrieren\b/i,
    /\bJOKARI GmbH\b/i,
    /\bImpressum\b/i,
    /\bZum Inhalt springen\b/i,
    /\bZum Seitenende springen\b/i,
    /\bZur Navigation am Seitenende springen\b/i,
    /\bJOKARI homepage\b/i,
    /\bHauptnavigation\b/i,
    /\bLink kopieren\b/i,
    /\bLink kopiert\b/i,
    /\bAdd to watchlist\b/i,
    /\bDialog schließen\b/i,
    /\bVerfügbare Händler\b/i,
    /\bKundengruppen\b/i,
    /\bZahlungsarten\b/i,
    /\bLieferart\b/i,
    /\bHändlertyp\b/i,
    /\bZu vorherigem Slide wechseln\b/i,
    /\bZu nächstem Slide wechseln\b/i,
    /\bJO!STORY\b/i,
  ]
  for (const pattern of cutPatterns) {
    const match = pattern.exec(text)
    if (match && match.index > 10) {
      text = text.slice(0, match.index).trim()
      break
    }
  }
  return text
    .replace(/\s*Jetzt bestellen!?$/i, '')
    .replace(/\s*Jetzt kaufen!?$/i, '')
    .trim()
}

function titleFromHtml(html, url) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const raw = cleanText(h1 || title || '')
  if (raw) return raw.split('|')[0].trim()
  return new URL(url).pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || url
}

function sql(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function jsonSql(value) {
  return `${sql(JSON.stringify(value))}::jsonb`
}

function envFileValue(key) {
  return process.env[key] || ''
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

function validateAllowedUrl(url, label = 'url') {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use http/https`)
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} host is not allowed: ${parsed.hostname}`)
  }
}

function uuid() {
  return crypto.randomUUID()
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item))
  }
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

function slug(url) {
  return new URL(url).pathname.split('/').filter(Boolean).pop() || 'website'
}

function extractArtNr(text, url) {
  const match = text.match(/(?:Art\.?-?Nr\.?|Artikelnummer|Article\s+No\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i)
  if (match) return match[1].replace(/[.,;:]$/, '')
  const digits = text.match(/\b(\d{5})\b/)
  return digits?.[1] || slug(url)
}

function keyPoints(text) {
  return text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean).slice(0, 5)
}

function relatedProducts(text) {
  const matches = text.match(/\b(?:JOKARI\s+)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9+-]*(?:\s+(?:No\.?\s*)?[A-ZÄÖÜ]?[A-Za-zÄÖÜäöüß0-9+-]+){0,3}\b/g) || []
  const blocked = new Set(['German', 'English', 'Login', 'Suchen', 'JOKARI GmbH', 'Direkt zum Inhalt'])
  return [...new Set(matches.map((m) => m.trim()).filter((m) => {
    const lower = m.toLowerCase()
    return m.length >= 4 && !blocked.has(m) && ['jokari', 'secura', 'sensor', 'strip', 'kabelmesser', 'abisolierzange', 'entmanteler'].some((marker) => lower.includes(marker))
  }))].slice(0, 10)
}

function imageCandidates(html, baseUrl) {
  const urls = []
  for (const metaName of ['og:image', 'twitter:image']) {
    const metaImage = metaContent(html, metaName)
    if (metaImage) urls.push(new URL(metaImage, baseUrl).href)
  }
  for (const image of extractH5PContent(html, baseUrl).images) {
    urls.push(image)
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0]
    const src = tag.match(/\s(?:src|data-src)=["']([^"']+)["']/i)?.[1]
    const srcset = tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1]?.split(',')?.[0]?.trim()?.split(/\s+/)?.[0]
    const raw = src || srcset
    if (!raw) continue
    const resolved = new URL(raw, baseUrl).href
    const pathname = new URL(resolved).pathname.toLowerCase()
    if (!pathname.match(/\.(jpe?g|png|webp)$/)) continue
    if (pathname.includes('favicon') || pathname.includes('logo') || pathname.includes('/icons/flags/') || pathname.includes('sprite')) continue
    urls.push(resolved)
  }
  return [...new Set(urls)]
}

function articleImageCandidates(html, baseUrl) {
  const urls = []
  const seenKeys = new Set()
  const article = articleHtml(html)
  const pushUrl = (raw) => {
    if (!raw) return
    const first = String(raw).split(',')[0]?.trim()?.split(/\s+/)?.[0]
    if (!first) return
    const resolved = new URL(first, baseUrl).href
    const pathname = new URL(resolved).pathname.toLowerCase()
    if (!pathname.match(/\.(jpe?g|png|webp)$/)) return
    if (pathname.includes('favicon') || pathname.includes('logo') || pathname.includes('/icons/flags/') || pathname.includes('sprite')) return
    const key = imageIdentity(resolved)
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    urls.push(resolved)
  }

  for (const metaName of ['og:image', 'twitter:image']) {
    const metaImage = metaContent(html, metaName)
    if (metaImage) pushUrl(metaImage)
  }
  for (const picture of article.matchAll(/<picture\b[\s\S]*?<\/picture>/gi)) {
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
  for (const match of article.matchAll(/<img\b[^>]*>/gi)) {
    pushUrl(match[0].match(/\ssrc=["']([^"']+)["']/i)?.[1] || match[0].match(/\ssrcset=["']([^"']+)["']/i)?.[1])
  }
  return [...new Set(urls)]
}

function imageIdentity(url) {
  const basename = decodeURIComponent(new URL(url).pathname.split('/').pop() || url).toLowerCase()
  return basename
    .replace(/^csm_/, '')
    .replace(/_[a-f0-9]{8,}(?=\.[a-z0-9]+$)/i, '')
}

function articleHtml(html) {
  const start = html.search(/<div[^>]+class=["'][^"']*article__header/i)
  if (start < 0) return html
  const tail = html.slice(start)
  const end = tail.search(/<!--\s*related things\s*-->|<div[^>]+class=["'][^"']*news-backlink-wrap/i)
  return end > 0 ? tail.slice(0, end) : tail
}

function firstCleanMatch(html, pattern) {
  return cleanText(html.match(pattern)?.[1] || '')
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

function extractJostoryArticle(html, baseUrl) {
  const block = articleHtml(html)
  const title = firstCleanMatch(block, /<h1[^>]*itemprop=["']headline["'][^>]*>([\s\S]*?)<\/h1>/i) || titleFromHtml(html, baseUrl)
  const teaser = firstCleanMatch(block, /<div[^>]+class=["'][^"']*teaser-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || metaContent(html, 'description')
  const publishedAt = firstCleanMatch(block, /<time[^>]+itemprop=["']datePublished["'][^>]*datetime=["']([^"']+)["'][^>]*>/i)
  const modifiedAt = firstCleanMatch(block, /<meta[^>]+itemprop=["']dateModified["'][^>]*content=["']([^"']+)["'][^>]*>/i)
  const category = firstCleanMatch(block, /<span[^>]+class=["'][^"']*news-list-category[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || 'JO!STORY'
  const author = firstCleanMatch(block, /<span[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i)
  const sections = []
  const headings = []

  for (const sectionMatch of block.matchAll(/<section\b[\s\S]*?<\/section>/gi)) {
    const section = sectionMatch[0]
    const heading = firstCleanMatch(section, /<h2[^>]*>([\s\S]*?)<\/h2>/i)
    const paragraphs = [...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean)
      .filter((part) => !/^Zurück\b/i.test(part))
      .filter((part) => !/^Das könnte Sie auch interessieren\b/i.test(part))
    const tables = extractTables(section)
    const captions = [...section.matchAll(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean)
    const parts = [heading, ...paragraphs, ...tables.map((table) => `Tabelle:\n${table}`), ...captions.map((caption) => `Bild: ${caption}`)].filter(Boolean)
    if (!parts.length) continue
    if (heading) headings.push(heading)
    sections.push(parts.join('\n\n'))
  }

  const content = [teaser, ...sections].filter(Boolean).join('\n\n').trim()
  const imageUrls = articleImageCandidates(html, baseUrl)
  return {
    title,
    content,
    teaser,
    publishedAt,
    modifiedAt,
    category,
    author,
    headings,
    imageUrls,
  }
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

function fieldText(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<div[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'))
  return cleanRichText(match?.[1] || '')
}

function fieldItems(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = className === 'field-kategorie'
    ? html.match(/<div[^>]+class=["'][^"']*field-kategorie[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["'][^"']*field-interaktiver-inhalt/i)
    : html.match(new RegExp(`<div[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'))
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

function classify(url, html) {
  const text = cleanText(html)
  const title = titleFromHtml(html, url)
  if (url.includes('www.jostudy.de/jowiki/')) {
    const h5p = extractH5PContent(html, url)
    const intro = fieldText(html, 'field-beschreibung')
    const categories = fieldItems(html, 'field-kategorie')
    const answer = [intro, ...h5p.texts].filter(Boolean).join('\n\n') || cleanWebsiteText(text)
    return {
      department: 'support',
      docType: 'faq',
      schemaType: 'FAQ',
      primaryKey: title,
      data: {
        question: title,
        answer: answer.slice(0, 6000),
        category: categories.join(' / ') || 'JO!Wiki',
        related_products: relatedProducts(answer),
      },
      evidence: answer.slice(0, 1000),
    }
  }
  if (url.includes('/produkte/detail/')) {
    const artnr = extractArtNr(text, url)
    const bullets = productDescriptionBullets(html)
    const details = productDetails(html)
    const description = metaContent(html, 'description') || bullets[0] || title
    const related = relatedProductCards(html)
    return {
      department: 'product',
      docType: 'product_spec',
      schemaType: 'ProductSpec',
      primaryKey: artnr,
      data: {
        artnr,
        name: title,
        description: description.slice(0, 6000),
        specs: {
          ...details,
          Merkmale: bullets,
        },
        compatibility: related.length ? related : relatedProducts([description, ...bullets].join(' ')),
      },
      evidence: [description, ...bullets, ...Object.entries(details).map(([k, v]) => `${k}: ${v}`)].join('\n').slice(0, 1000),
    }
  }
  if (url.includes('/wissen/blog-jostory/detail/')) {
    const article = extractJostoryArticle(html, url)
    return {
      department: 'sales',
      docType: 'training_module',
      schemaType: 'TrainingModule',
      primaryKey: `${article.title}:website`,
      data: {
        title: article.title,
        version: 'website-import-2026-04-27',
        content: article.content || text.slice(0, 6000),
        objectives: [],
        target_audience: 'Vertrieb, Support und Wissensnutzer',
        product_category: article.category || 'JO!STORY',
        key_points: [article.teaser, ...article.headings].filter(Boolean).slice(0, 8),
        related_products: relatedProducts(article.content),
        summary: article.teaser || null,
        author: article.author || null,
        published_at: article.publishedAt || null,
        modified_at: article.modifiedAt || null,
        article_images: article.imageUrls,
      },
      evidence: (article.content || text).slice(0, 1000),
    }
  }
  return {
    department: 'sales',
    docType: 'training_module',
    schemaType: 'TrainingModule',
    primaryKey: `${title}:website`,
    data: {
      title,
      version: 'website-import-2026-04-27',
      content: text.slice(0, 6000),
      objectives: [],
      target_audience: null,
      product_category: 'Website Content',
      key_points: keyPoints(text),
      related_products: relatedProducts(text),
    },
    evidence: text.slice(0, 1000),
  }
}

function recordSql(item) {
  const recordId = sql(item.recordId)
  const importId = sql(item.importId)
  const evidenceId = sql(item.evidenceId)
  const updateId = sql(item.updateId)
  const dataJson = { ...item.data, _source: item.source }
  const attachmentCte = item.asset?.uploaded ? `,
inserted_attachment as (
  insert into public.record_attachments (id, record_id, filename, file_type, file_path, file_size, created_at)
  select ${sql(item.asset.attachmentId)}::uuid, selected.record_id, ${sql(item.asset.filename)}, ${sql(item.asset.contentType)}, ${sql(item.asset.objectPath)}, ${sql(String(item.asset.size))}, now()
  from selected
  where exists (select 1 from inserted_record)
)` : ''

  return `
with existing_import as (
  select record_id from public.external_imports
  where source_type = ${sql(SOURCE_TYPE)}
    and source_id = ${sql(item.sourceId)}
    and content_hash = ${sql(item.contentHash)}
),
existing_record as (
  select id as record_id, data_json
  from public.records
  where schema_type = ${sql(item.schemaType)}
    and primary_key = ${sql(item.primaryKey)}
  order by updated_at desc
  limit 1
),
existing_same_content as (
  select record_id
  from existing_record
  where data_json #>> '{_source,content_hash}' = ${sql(item.contentHash)}
),
inserted_record as (
  insert into public.records (id, document_id, department, schema_type, primary_key, data_json, completeness_score, status, version, created_at, updated_at)
  select ${recordId}::uuid, null, ${sql(item.department)}, ${sql(item.schemaType)}, ${sql(item.primaryKey)}, ${jsonSql(dataJson)}, 0.85, 'needs_review', 1, now(), now()
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
  select ${updateId}::uuid, existing_record.record_id, null, ${jsonSql(dataJson)},
    jsonb_build_object(
      'added', '{}'::jsonb,
      'removed', '{}'::jsonb,
      'changed', jsonb_build_object(
        'data_json', jsonb_build_object('old', existing_record.data_json, 'new', ${jsonSql(dataJson)})
      ),
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
  select ${importId}::uuid, ${sql(SOURCE_TYPE)}, ${sql(item.sourceId)}, ${sql(item.url)}, null, 'unauthenticated_public', ${sql(item.contentHash)}, ${sql(item.sourceVersion)}, null,
    case when exists (select 1 from existing_same_content) then 'skipped_duplicate' else 'needs_review' end,
    selected.record_id,
    ${jsonSql({ schema_type: item.schemaType, primary_key: item.primaryKey, imported_by: ACTOR })} ||
      jsonb_build_object(
        'action',
        case
          when exists (select 1 from inserted_record) then 'created_record'
          when exists (select 1 from inserted_update) then 'created_proposed_update'
          else 'skipped_duplicate'
        end
      ),
    now()
  from selected
  where not exists (select 1 from existing_import)
),
inserted_evidence as (
  insert into public.evidence (id, record_id, chunk_id, field_path, excerpt, start_offset, end_offset)
  select ${evidenceId}::uuid, selected.record_id, null, '_source', ${sql(item.evidence)}, null, null
  from selected
  where exists (select 1 from inserted_record)
)
${attachmentCte},
inserted_audit as (
  insert into public.audit_logs (id, action, entity_type, entity_id, actor, details_json, timestamp)
  select ${sql(item.auditId)}::uuid,
    case
      when exists (select 1 from inserted_record) then 'external_import_needs_review'
      when exists (select 1 from inserted_update) then 'external_import_proposed_update'
      else 'external_import_duplicate'
    end,
    'Record',
    selected.record_id,
    ${sql(ACTOR)},
    ${jsonSql({ source_type: SOURCE_TYPE, source_id: item.sourceId, content_hash: item.contentHash })} ||
      jsonb_build_object(
        'proposed_update_id',
        (select id::text from inserted_update limit 1)
      ),
    now()
  from selected
  where not exists (select 1 from existing_import)
)
select 1;
`
}

async function fetchText(url) {
  validateAllowedUrl(url, 'page url')
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  validateAllowedUrl(res.url, 'final page url')
  return await res.text()
}

async function downloadAsset(url, index) {
  validateAllowedUrl(url, 'image url')
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  validateAllowedUrl(res.url, 'final image url')
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  if (!contentType.startsWith('image/')) throw new Error(`${url} is not an image`)
  const contentLength = Number(res.headers.get('content-length') || 0)
  if (contentLength > MAX_IMAGE_BYTES) throw new Error(`${url} is too large (${contentLength} bytes)`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`${url} is too large (${bytes.length} bytes)`)
  const extension = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg'
  const filename = `${index}${extension}`
  const localPath = path.join(ASSET_DIR, filename)
  await fs.writeFile(localPath, bytes)
  const imageHash = crypto.createHash('sha256').update(bytes).digest('hex')
  return {
    localPath,
    filename,
    contentType,
    size: bytes.length,
    objectPath: `documents/website-import-${imageHash}${extension}`,
    attachmentId: uuid(),
    bytes,
    uploaded: false,
  }
}

async function uploadAsset(asset) {
  if (!UPLOAD_ASSETS || !asset) return asset
  const key = serviceRoleKey()
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for --upload-assets')
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
    if (response.status !== 409 && !/already exists|Duplicate/i.test(body)) {
      throw new Error(`Supabase Storage upload failed ${response.status}: ${body}`)
    }
  }
  return { ...asset, uploaded: true }
}

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(ASSET_DIR, { recursive: true })

  const sitemap = await fetchText(JOKARI_SITEMAP)
  const jokariUrls = [...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)]
    .map((m) => m[1])
    .filter((url) => url.includes('/produkte/detail/') || url.includes('/wissen/blog-jostory/detail/'))

  const jowikiHtml = await fetchText(JOSTUDY_JOWIKI)
  const jowikiUrls = [...jowikiHtml.matchAll(/href=["']([^"']+)["']/g)]
    .map((m) => new URL(m[1], JOSTUDY_JOWIKI).href)
    .filter((url) => url.includes('www.jostudy.de/jowiki/'))

  const urls = [...new Set([...jokariUrls, ...jowikiUrls])].sort()
  const items = []
  const failures = []

  for (const url of urls) {
    try {
      const html = await fetchText(url)
      const normalized = classify(url, html)
      const contentHash = sha256(normalized.data)
      const sourceId = `${SOURCE_TYPE}:${url}`
      const source = {
        source_type: SOURCE_TYPE,
        source_id: sourceId,
        source_url: url,
        api_endpoint: null,
        source_version: 'website-import-2026-04-27',
        content_hash: contentHash,
        trust_type: 'unauthenticated_public',
        authenticated_source: false,
        imported_at: new Date().toISOString(),
      }

      let asset = null
      const imageUrl = (url.includes('/wissen/blog-jostory/detail/')
        ? articleImageCandidates(html, url)
        : imageCandidates(html, url))[0]
      if (imageUrl) {
        try {
          asset = await uploadAsset(await downloadAsset(imageUrl, String(items.length + 1).padStart(3, '0')))
          asset.sourceUrl = imageUrl
        } catch (error) {
          failures.push({ url: imageUrl, error: error.message, type: 'image' })
        }
      }

      items.push({
        ...normalized,
        url,
        sourceId,
        source,
        sourceVersion: 'website-import-2026-04-27',
        contentHash,
        recordId: uuid(),
        importId: uuid(),
        evidenceId: uuid(),
        updateId: uuid(),
        auditId: uuid(),
        asset,
      })
    } catch (error) {
      failures.push({ url, error: error.message, type: 'page' })
    }
  }

  const sqlText = `begin;\n${items.map(recordSql).join('\n')}\ncommit;\n`
  await fs.writeFile(SQL_PATH, sqlText)
  await fs.writeFile(MANIFEST_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    urls_considered: urls.length,
    records: items.length,
    assets: items.filter((item) => item.asset).length,
    uploaded_assets: items.filter((item) => item.asset?.uploaded).length,
    upload_assets: UPLOAD_ASSETS,
    failures,
    items: items.map((item) => ({
      url: item.url,
      department: item.department,
      schema_type: item.schemaType,
      primary_key: item.primaryKey,
      source_id: item.sourceId,
      content_hash: item.contentHash,
      asset: item.asset ? {
        localPath: item.asset.localPath,
        filename: item.asset.filename,
        contentType: item.asset.contentType,
        size: item.asset.size,
        objectPath: item.asset.objectPath,
        sourceUrl: item.asset.sourceUrl,
        uploaded: item.asset.uploaded,
      } : null,
    })),
  }, null, 2))

  console.log(JSON.stringify({
    out_dir: OUT_DIR,
    sql_path: SQL_PATH,
    manifest_path: MANIFEST_PATH,
    urls_considered: urls.length,
    records: items.length,
    assets: items.filter((item) => item.asset).length,
    failures: failures.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
