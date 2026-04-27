from app.models.audit_log import AuditLog
import json
from app.models.attachment import RecordAttachment
from app.models.document import Department, DocType
from app.models.evidence import Evidence
from app.models.external_import import ExternalImport, ExternalSourceType, ExternalTrustType
from app.models.proposed_update import ProposedUpdate
from app.models.record import Record, RecordStatus
from app.schemas.external_ingestion import (
    ExternalImportRequest,
    ModelPricing,
    SitemapPlanRequest,
    TokenEstimateItem,
    TokenEstimateRequest,
    WebsiteImportRequest,
)
from app.services.external_ingestion import (
    ExternalKnowledgeImportService,
    HttpWebsiteFetcher,
    SitemapPlanningService,
    TokenCostEstimator,
    WebsiteCrawlerImportService,
    WebsiteUrlGuard,
)
import pytest


class FakeWebsiteFetcher:
    def __init__(self, html_by_url=None, binary_by_url=None):
        self.html_by_url = html_by_url or {}
        self.binary_by_url = binary_by_url or {}

    def fetch_html(self, url):
        return self.html_by_url[url]

    def fetch_binary(self, url):
        return self.binary_by_url[url]


class FakeStorage:
    def __init__(self):
        self.uploaded = []

    def upload_file(self, file_content, filename, content_type=None):
        self.uploaded.append((file_content, filename, content_type))
        return f"documents/fake-{filename}"


def _product_payload(**overrides):
    data = {
        "source_type": ExternalSourceType.DIRECT_PIM_API,
        "source_id": "pim:product:30199",
        "source_url": "https://jokari.de/produkte/detail/entmanteler-pv-strip-pro",
        "api_endpoint": "/pim/products/30199",
        "source_version": "2026-04-27",
        "trust_type": ExternalTrustType.AUTHENTICATED_PIM,
        "authenticated_source": True,
        "department": Department.PRODUCT,
        "doc_type": DocType.PRODUCT_SPEC,
        "data_json": {
            "artnr": "30199",
            "name": "Entmanteler PV-Strip Pro",
            "description": "Werkzeug fuer Solarleitungen.",
            "specs": {"range": "1,5 - 16 mm2"},
            "compatibility": ["Solarleitungen", "Photovoltaikleitungen"],
        },
        "evidence_excerpt": "Art.-Nr. 30199 Entmanteler PV-Strip Pro",
    }
    data.update(overrides)
    return ExternalImportRequest(**data)


def test_token_cost_estimator_calculates_input_output_and_costs():
    response = TokenCostEstimator().estimate(
        TokenEstimateRequest(
            pricing=ModelPricing(
                model="test-model",
                input_per_million=1.0,
                output_per_million=2.0,
                verified_on="2026-04-27",
                source_url="https://example.test/pricing",
            ),
            items=[
                TokenEstimateItem(
                    source_type=ExternalSourceType.SITEMAP,
                    source_id="product",
                    average_chars=4000,
                    record_count=2,
                    expected_output_tokens_per_record=500,
                )
            ],
        )
    )

    assert response.input_tokens == 2000
    assert response.output_tokens == 1000
    assert response.estimated_total_cost_usd == 0.004


def test_sitemap_planner_counts_unique_urls_and_duplicates():
    xml = """
    <urlset>
      <url><loc>https://jokari.de/produkte/detail/entmanteler-pv-strip-pro</loc></url>
      <url><loc>https://jokari.de/produkte/detail/entmanteler-pv-strip-pro</loc></url>
      <url><loc>https://jokari.de/wissen/blog-jostory/detail/pur-leitungen-richtig-abisolieren</loc></url>
      <url><loc>https://www.jostudy.de/jowiki/was-ist-ein-kabelmesser</loc></url>
    </urlset>
    """

    plan = SitemapPlanningService().plan(SitemapPlanRequest(sitemap_xml=xml).sitemap_xml)

    assert plan.summary.total_entries == 4
    assert plan.summary.unique_urls == 3
    assert plan.summary.duplicates == 1
    assert plan.summary.by_source_type["product_detail"] == 1
    assert plan.summary.by_source_type["content_detail"] == 1
    assert plan.summary.by_source_type["jowiki_article"] == 1


def test_trusted_pim_import_auto_approves_and_writes_audit_log(db_session):
    response = ExternalKnowledgeImportService(db_session).import_record(
        _product_payload(),
        actor="pim-service",
        actor_is_pim_trusted=True,
    )

    record = db_session.query(Record).filter(Record.id == response.record_id).first()
    external_import = db_session.query(ExternalImport).filter(ExternalImport.id == response.import_id).first()
    audit = db_session.query(AuditLog).filter(AuditLog.action == "external_import_auto_approved").first()

    assert response.auto_approved is True
    assert record.status == RecordStatus.APPROVED
    assert record.data_json["_source"]["source_id"] == "pim:product:30199"
    assert external_import.content_hash == response.content_hash
    assert external_import.authenticated_actor == "pim-service"
    assert audit is not None
    assert audit.details_json["trust_type"] == ExternalTrustType.AUTHENTICATED_PIM.value


def test_sitemap_import_needs_review_even_with_public_url(db_session):
    payload = _product_payload(
        source_type=ExternalSourceType.SITEMAP,
        source_id="sitemap:https://jokari.de/produkte/detail/entmanteler-pv-strip-pro",
        api_endpoint=None,
        trust_type=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
        authenticated_source=False,
    )

    response = ExternalKnowledgeImportService(db_session).import_record(payload, actor="crawler")
    record = db_session.query(Record).filter(Record.id == response.record_id).first()

    assert response.auto_approved is False
    assert record.status == RecordStatus.NEEDS_REVIEW


def test_cloudflare_crawl_transport_alone_does_not_auto_approve(db_session):
    payload = _product_payload(
        source_type=ExternalSourceType.CLOUDFLARE_API,
        source_id="cloudflare:crawl:30199",
        trust_type=ExternalTrustType.AUTHENTICATED_CLOUDFLARE,
        authenticated_source=True,
    )

    response = ExternalKnowledgeImportService(db_session).import_record(payload, actor="cloudflare-crawler")
    record = db_session.query(Record).filter(Record.id == response.record_id).first()

    assert response.auto_approved is False
    assert record.status == RecordStatus.NEEDS_REVIEW


def test_cloudflare_pim_claim_does_not_auto_approve_even_for_pim_actor(db_session):
    payload = _product_payload(
        source_type=ExternalSourceType.CLOUDFLARE_API,
        source_id="cloudflare:crawl:pim-claim:30199",
        trust_type=ExternalTrustType.AUTHENTICATED_PIM,
        authenticated_source=True,
    )

    response = ExternalKnowledgeImportService(db_session).import_record(
        payload,
        actor="pim-service",
        actor_is_pim_trusted=True,
    )
    record = db_session.query(Record).filter(Record.id == response.record_id).first()

    assert response.auto_approved is False
    assert record.status == RecordStatus.NEEDS_REVIEW


def test_direct_pim_claim_needs_trusted_actor_for_auto_approval(db_session):
    response = ExternalKnowledgeImportService(db_session).import_record(
        _product_payload(),
        actor="generic-source",
        actor_is_pim_trusted=False,
    )
    record = db_session.query(Record).filter(Record.id == response.record_id).first()

    assert response.auto_approved is False
    assert record.status == RecordStatus.NEEDS_REVIEW


def test_firecrawl_crawler_source_does_not_auto_approve(db_session):
    payload = _product_payload(
        source_type=ExternalSourceType.FIRECRAWL,
        source_id="firecrawl:jostudy:jowiki:was-ist-ein-kabelmesser",
        source_url="https://www.jostudy.de/jowiki/was-ist-ein-kabelmesser",
        api_endpoint=None,
        trust_type=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
        authenticated_source=False,
    )

    response = ExternalKnowledgeImportService(db_session).import_record(payload, actor="firecrawl")
    record = db_session.query(Record).filter(Record.id == response.record_id).first()

    assert response.auto_approved is False
    assert record.status == RecordStatus.NEEDS_REVIEW


def test_duplicate_import_is_idempotent(db_session):
    service = ExternalKnowledgeImportService(db_session)
    first = service.import_record(_product_payload(), actor="pim-service", actor_is_pim_trusted=True)
    second = service.import_record(_product_payload(), actor="pim-service", actor_is_pim_trusted=True)

    assert second.duplicate is True
    assert second.record_id == first.record_id
    assert db_session.query(Record).count() == 1
    assert db_session.query(ExternalImport).count() == 1


def test_server_recomputes_content_hash_instead_of_trusting_request_hash(db_session):
    service = ExternalKnowledgeImportService(db_session)
    first = service.import_record(_product_payload(), actor="pim-service", actor_is_pim_trusted=True)
    changed = _product_payload(
        content_hash=first.content_hash,
        data_json={
            "artnr": "30199",
            "name": "Entmanteler PV-Strip Pro",
            "description": "Changed trusted PIM content.",
            "specs": {"range": "1,5 - 16 mm2"},
            "compatibility": ["Solarleitungen"],
        },
    )

    second = service.import_record(changed, actor="pim-service", actor_is_pim_trusted=True)

    assert second.duplicate is False
    assert second.status == "updated"
    assert second.content_hash != first.content_hash


def test_untrusted_update_for_existing_approved_record_does_not_add_record_evidence(db_session):
    service = ExternalKnowledgeImportService(db_session)
    first = service.import_record(_product_payload(), actor="pim-service", actor_is_pim_trusted=True)
    changed_payload = _product_payload(
        source_type=ExternalSourceType.SITEMAP,
        source_id="sitemap:https://jokari.de/produkte/detail/entmanteler-pv-strip-pro",
        api_endpoint=None,
        trust_type=ExternalTrustType.UNAUTHENTICATED_PUBLIC,
        authenticated_source=False,
        data_json={
            "artnr": "30199",
            "name": "Entmanteler PV-Strip Pro",
            "description": "Unreviewed crawler text.",
            "specs": {"range": "1,5 - 16 mm2"},
            "compatibility": ["Solarleitungen"],
        },
    )

    response = service.import_record(changed_payload, actor="crawler")

    assert response.auto_approved is False
    assert response.record_id == first.record_id
    assert db_session.query(Record).filter(Record.id == first.record_id).first().status == RecordStatus.APPROVED
    assert db_session.query(ProposedUpdate).count() == 1
    assert db_session.query(Evidence).filter(Evidence.record_id == first.record_id).count() == 1


def test_untrusted_website_update_for_existing_approved_record_does_not_attach_images(db_session):
    service = ExternalKnowledgeImportService(db_session)
    first = service.import_record(_product_payload(), actor="pim-service", actor_is_pim_trusted=True)
    url = "https://jokari.de/produkte/detail/entmanteler-pv-strip-pro"
    image_url = "https://jokari.de/media/products/pv-strip-pro.jpg"
    fetcher = FakeWebsiteFetcher(
        html_by_url={
            url: """
            <html><head><title>Entmanteler PV-Strip Pro | JOKARI</title></head>
            <body><h1>Entmanteler PV-Strip Pro</h1>
            <div itemprop="description"><ul>
              <li>Unreviewed crawler text with changed public website content.</li>
            </ul></div><div class="product__certifications"></div>
            <dialog id="productDetails"><dl>
              <dt>Art.-Nr.:</dt><dd>30199</dd>
              <dt>EAN:</dt><dd>4011391301993</dd>
            </dl></dialog>
            <img src="/media/products/pv-strip-pro.jpg" width="900" height="600" alt="PV Strip Pro">
            </body></html>
            """,
        },
        binary_by_url={image_url: (b"public-image", "image/jpeg")},
    )

    response = WebsiteCrawlerImportService(db_session, fetcher=fetcher, storage=FakeStorage()).import_public_pages(
        WebsiteImportRequest(urls=[url], source_type=ExternalSourceType.CRAWLEE, include_images=True),
        actor="crawler",
    )

    assert response.results[0].record_id == first.record_id
    assert response.results[0].images_found == 1
    assert response.results[0].images_attached == 0
    assert response.images_attached == 0
    assert db_session.query(ProposedUpdate).count() == 1
    assert db_session.query(RecordAttachment).filter(RecordAttachment.record_id == first.record_id).count() == 0


def test_website_import_fetches_jowiki_article_and_attaches_images(db_session):
    url = "https://www.jostudy.de/jowiki/was-ist-ein-kabelmesser"
    image_url = "https://www.jostudy.de/sites/default/files/kabelmesser.jpg"
    fetcher = FakeWebsiteFetcher(
        html_by_url={
            url: """
            <html><head><title>Was ist ein Kabelmesser? | JO!Study</title></head>
            <body><main>
              <h1>Was ist ein Kabelmesser?</h1>
              <p>Ein Kabelmesser ist ein Werkzeug der Kabelbearbeitung von JOKARI.</p>
              <img src="/_assets/Icons/Flags/de.webp" width="16" height="16" alt="">
              <img src="/sites/default/files/kabelmesser.jpg" alt="Kabelmesser">
            </main></body></html>
            """,
        },
        binary_by_url={image_url: (b"image-bytes", "image/jpeg")},
    )
    storage = FakeStorage()

    response = WebsiteCrawlerImportService(db_session, fetcher=fetcher, storage=storage).import_public_pages(
        WebsiteImportRequest(urls=[url], source_type=ExternalSourceType.CRAWLEE, include_images=True),
        actor="crawler",
    )
    record = db_session.query(Record).filter(Record.id == response.results[0].record_id).first()
    attachment = db_session.query(RecordAttachment).filter(RecordAttachment.record_id == record.id).first()

    assert response.total_urls == 1
    assert response.needs_review == 1
    assert response.images_attached == 1
    assert record.status == RecordStatus.NEEDS_REVIEW
    assert record.schema_type == "FAQ"
    assert record.data_json["question"] == "Was ist ein Kabelmesser?"
    assert attachment.filename == "kabelmesser.jpg"
    assert attachment.file_path == "documents/fake-kabelmesser.jpg"


def test_website_import_extracts_jowiki_h5p_text_and_image(db_session):
    url = "https://www.jostudy.de/jowiki/isolationsstoff-papier"
    image_url = "https://www.jostudy.de/sites/default/files/h5p/content/453/images/file-paper.png"
    h5p_json = (
        '{"content":[{"content":{"params":{"text":"<p>Papier ist ein weiterer Isolierstoff.</p>"}},'
        '"useSeparator":"disabled"},{"content":{"params":{"file":{"path":"images/file-paper.png",'
        '"mime":"image/png","width":2900,"height":1200}}}},{"content":{"params":{"text":"<p>Elektrolytpapier wird zum Wickeln von Kondensatoren genutzt.</p>"}}}]}'
    )
    fetcher = FakeWebsiteFetcher(
        html_by_url={
            url: f"""
            <html><head><title>Isolationsstoff Papier | JO!Study</title></head>
            <body>
              <h1>Isolationsstoff Papier</h1>
              <article>
                <div class="field-beschreibung"><p>Geschichte der Kabelentwicklung: Papier</p></div>
                <div class="field-kategorie"><div>Kabel und Leitungen</div><div>Historie der Kabelentwicklung</div></div>
                <div class="field-interaktiver-inhalt"><div class="h5p-content" data-content-id="453"></div></div>
              </article>
              <script type="application/json" data-drupal-selector="drupal-settings-json">
                {{"h5p":{{"H5PIntegration":{{"contents":{{"cid-453":{{"jsonContent":{json.dumps(h5p_json)}}}}}}}}}}}
              </script>
            </body></html>
            """,
        },
        binary_by_url={image_url: (b"paper-image", "image/png")},
    )

    response = WebsiteCrawlerImportService(db_session, fetcher=fetcher, storage=FakeStorage()).import_public_pages(
        WebsiteImportRequest(urls=[url], source_type=ExternalSourceType.CRAWLEE, include_images=True),
        actor="crawler",
    )
    record = db_session.query(Record).filter(Record.id == response.results[0].record_id).first()
    attachment = db_session.query(RecordAttachment).filter(RecordAttachment.record_id == record.id).first()

    assert "Papier ist ein weiterer Isolierstoff" in record.data_json["answer"]
    assert "Elektrolytpapier wird zum Wickeln" in record.data_json["answer"]
    assert "JOKARI GmbH" not in record.data_json["answer"]
    assert record.data_json["category"] == "Kabel und Leitungen / Historie der Kabelentwicklung"
    assert attachment.filename == "file-paper.png"


def test_website_import_preserves_jowiki_h5p_paragraphs(db_session):
    url = "https://www.jostudy.de/jowiki/schaelwerkzeug"
    h5p_json = (
        '{"content":[{"content":{"params":{"text":"<p>Der Leiter besteht aus mehrdrähtigen Kupferleitern.</p>\\n\\n'
        '<p>Der Leiter wird durch eine VPE-Isolierung umschlossen.</p>\\n\\n'
        '<p>Der Kupferschirm dient zur Abschirmung des Kabels.</p>"}}}]}'
    )
    fetcher = FakeWebsiteFetcher(
        html_by_url={
            url: f"""
            <html><head><title>Schälwerkzeug | JO!Study</title></head>
            <body>
              <h1>Schälwerkzeug</h1>
              <article>
                <div class="field-beschreibung"><p>Hier erfahren Sie mehr über Schälwerkzeuge.</p></div>
                <div class="field-kategorie"><div>Schälwerkzeug</div></div>
                <div class="field-interaktiver-inhalt"><div class="h5p-content" data-content-id="438"></div></div>
              </article>
              <script type="application/json" data-drupal-selector="drupal-settings-json">
                {{"h5p":{{"H5PIntegration":{{"contents":{{"cid-438":{{"jsonContent":{json.dumps(h5p_json)}}}}}}}}}}}
              </script>
            </body></html>
            """,
        },
    )

    response = WebsiteCrawlerImportService(db_session, fetcher=fetcher, storage=FakeStorage()).import_public_pages(
        WebsiteImportRequest(urls=[url], source_type=ExternalSourceType.CRAWLEE, include_images=False),
        actor="crawler",
    )
    record = db_session.query(Record).filter(Record.id == response.results[0].record_id).first()

    assert record.data_json["answer"] == (
        "Hier erfahren Sie mehr über Schälwerkzeuge.\n\n"
        "Der Leiter besteht aus mehrdrähtigen Kupferleitern.\n\n"
        "Der Leiter wird durch eine VPE-Isolierung umschlossen.\n\n"
        "Der Kupferschirm dient zur Abschirmung des Kabels."
    )


def test_website_import_normalizes_product_detail_without_auto_approval(db_session):
    url = "https://jokari.de/produkte/detail/entmanteler-pv-strip-pro"
    fetcher = FakeWebsiteFetcher(
        html_by_url={
            url: """
            <html><head><title>Entmanteler PV-Strip Pro | JOKARI</title></head>
            <body><h1>Entmanteler PV-Strip Pro</h1>
            <div class="product__subtitle">Art.-Nr. 30199</div>
            <div itemprop="description"><ul>
              <li>Profiwerkzeug fuer Solarkabel.</li>
              <li>Arbeitsbereich: 1,5 - 16 mm2</li>
            </ul></div><div class="product__certifications"></div>
            <dialog id="productDetails"><dl>
              <dt>Art.-Nr.:</dt><dd>30199</dd>
              <dt>EAN:</dt><dd>4011391301993</dd>
              <dt>HSCode:</dt><dd>82119300</dd>
            </dl></dialog>
            <h2>Verwandte Produkte</h2>
            <div class="teaser__subtitle">Art.-Nr. 62000</div>
            <div class="teaser__title">QUADRO Plus</div>
            <div class="teaser__text">Multifunktionszange fuer PVC-isolierte Leiter.</div>
            </body></html>
            """,
        },
    )

    response = WebsiteCrawlerImportService(db_session, fetcher=fetcher, storage=FakeStorage()).import_public_pages(
        WebsiteImportRequest(urls=[url], source_type=ExternalSourceType.CRAWLEE, include_images=False),
        actor="crawler",
    )
    record = db_session.query(Record).filter(Record.id == response.results[0].record_id).first()

    assert response.needs_review == 1
    assert record.schema_type == "ProductSpec"
    assert record.status == RecordStatus.NEEDS_REVIEW
    assert record.data_json["artnr"] == "30199"
    assert record.data_json["name"] == "Entmanteler PV-Strip Pro"
    assert record.data_json["description"] == "Profiwerkzeug fuer Solarkabel."
    assert record.data_json["specs"]["EAN"] == "4011391301993"
    assert record.data_json["specs"]["HSCode"] == "82119300"
    assert record.data_json["specs"]["Merkmale"] == ["Profiwerkzeug fuer Solarkabel.", "Arbeitsbereich: 1,5 - 16 mm²"]
    assert "Quelle" not in record.data_json["specs"]
    assert record.data_json["compatibility"] == ["QUADRO Plus (Art.-Nr. 62000): Multifunktionszange fuer PVC-isolierte Leiter."]


def test_website_import_normalizes_jostory_article_without_navigation_truncation(db_session):
    url = "https://jokari.de/wissen/blog-jostory/detail/die-groessen-von-kabel-und-leitungen"
    image_url = "https://jokari.de/media/Wissen/Blog_JO_STORY/kabel.jpg"
    fetcher = FakeWebsiteFetcher(
        html_by_url={
            url: """
            <html><head>
              <title>Die Größen von Kabel und Leitungen | JOKARI</title>
              <meta property="og:image" content="https://jokari.de/media/Wissen/Blog_JO_STORY/kabel.jpg">
            </head><body>
              <nav>Hauptnavigation Produkte Alle Produkte Merkliste</nav>
              <main>
                <div class="article__header"><h1 itemprop="headline">Die Größen von Kabel und Leitungen</h1></div>
                <div class="article__footer">
                  <time itemprop="datePublished" datetime="2024-06-03T14:23:00+02:00">03.06.2024</time>
                  <meta itemprop="dateModified" content="2025-10-02T10:34:27+02:00">
                  <span class="news-list-category">Wissenswertes</span>
                  <span class="news-list-author">Erstellt von <span itemprop="name">Johannes Wienecke</span></span>
                </div>
                <div class="teaser-text" itemprop="description">
                  <p>Leitungsdurchmesser, Kabelquerschnitt, Außendurchmesser, AWG.</p>
                </div>
                <section class="component-container">
                  <header><h2>Was ist ein Leitungsquerschnitt?</h2></header>
                  <p>Der Kabelquerschnitt ist ein Flächenmaß und der Leitungsdurchmesser ein Längenmaß.</p>
                  <img src="/media/Wissen/Blog_JO_STORY/kabel.jpg" width="900" height="600" alt="Kabel">
                </section>
                <section class="component-container">
                  <header><h2>AWG Vergleichstabelle</h2></header>
                  <p>Die Tabelle bezieht sich auf massive Leiter.</p>
                  <table><tr><th>AWG-Nr.</th><th>Querschnitt in mm²</th></tr><tr><td>20</td><td>0,52</td></tr></table>
                </section>
                <div class="news-backlink-wrap">Zurück</div>
              </main>
              <footer>JOKARI GmbH Impressum</footer>
            </body></html>
            """,
        },
        binary_by_url={image_url: (b"article-image", "image/jpeg")},
    )

    response = WebsiteCrawlerImportService(db_session, fetcher=fetcher, storage=FakeStorage()).import_public_pages(
        WebsiteImportRequest(urls=[url], source_type=ExternalSourceType.CRAWLEE, include_images=True),
        actor="crawler",
    )
    record = db_session.query(Record).filter(Record.id == response.results[0].record_id).first()
    attachment = db_session.query(RecordAttachment).filter(RecordAttachment.record_id == record.id).first()

    assert response.needs_review == 1
    assert response.images_attached == 1
    assert record.schema_type == "TrainingModule"
    assert record.data_json["title"] == "Die Größen von Kabel und Leitungen"
    assert record.data_json["product_category"] == "Wissenswertes"
    assert record.data_json["author"] == "Johannes Wienecke"
    assert "Hauptnavigation" not in record.data_json["content"]
    assert "JOKARI GmbH" not in record.data_json["content"]
    assert "AWG-Nr. | Querschnitt in mm²" in record.data_json["content"]
    assert "Was ist ein Leitungsquerschnitt?" in record.data_json["key_points"]
    assert attachment.filename == "kabel.jpg"


def test_website_import_skips_disallowed_hosts(db_session):
    fetcher = FakeWebsiteFetcher(
        html_by_url={
            "http://169.254.169.254/latest/meta-data": "<html><body>secret</body></html>",
        },
    )

    response = WebsiteCrawlerImportService(db_session, fetcher=fetcher, storage=FakeStorage()).import_public_pages(
        WebsiteImportRequest(
            urls=["http://169.254.169.254/latest/meta-data"],
            source_type=ExternalSourceType.CRAWLEE,
        ),
        actor="crawler",
    )

    assert response.total_urls == 0
    assert db_session.query(Record).count() == 0


def test_website_import_skips_disallowed_image_hosts(db_session):
    url = "https://www.jostudy.de/jowiki/was-ist-ein-kabelmesser"
    fetcher = FakeWebsiteFetcher(
        html_by_url={
            url: """
            <html><head><title>Was ist ein Kabelmesser?</title></head>
            <body><p>Ein Kabelmesser ist ein Werkzeug.</p>
            <img src="http://169.254.169.254/secret.jpg"></body></html>
            """,
        },
        binary_by_url={"http://169.254.169.254/secret.jpg": (b"secret", "image/jpeg")},
    )

    response = WebsiteCrawlerImportService(db_session, fetcher=fetcher, storage=FakeStorage()).import_public_pages(
        WebsiteImportRequest(urls=[url], source_type=ExternalSourceType.CRAWLEE),
        actor="crawler",
    )

    assert response.total_urls == 1
    assert response.results[0].images_found == 1
    assert response.images_attached == 0


def test_website_import_rejects_direct_pim_source_type():
    with pytest.raises(ValueError, match="crawler-basierte"):
        WebsiteImportRequest(
            urls=["https://jokari.de/produkte/detail/entmanteler-pv-strip-pro"],
            source_type=ExternalSourceType.DIRECT_PIM_API,
        )


def test_website_fetcher_validates_final_redirect_url(monkeypatch):
    class RedirectResponse:
        url = "http://169.254.169.254/latest/meta-data"
        text = "secret"
        content = b"secret"
        headers = {"content-type": "text/plain"}

        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, *args, **kwargs):
            return None

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def get(self, url):
            return RedirectResponse()

    monkeypatch.setattr("app.services.external_ingestion.httpx.Client", FakeClient)
    monkeypatch.setattr("app.services.external_ingestion.socket.getaddrinfo", lambda *args, **kwargs: [(None, None, None, None, ("93.184.216.34", 0))])

    fetcher = HttpWebsiteFetcher(WebsiteUrlGuard(["jokari.de"]))

    with pytest.raises(ValueError, match="Host ist nicht erlaubt|private oder lokale"):
        fetcher.fetch_html("https://jokari.de/produkte/detail/entmanteler-pv-strip-pro")


def test_external_import_rejects_schema_type_doc_type_mismatch(db_session):
    payload = _product_payload(schema_type="FAQ")

    with pytest.raises(ValueError, match="schema_type"):
        ExternalKnowledgeImportService(db_session).import_record(
            payload,
            actor="pim-service",
            actor_is_pim_trusted=True,
        )
