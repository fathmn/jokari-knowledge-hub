import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base

# Test database URL (SQLite for testing)
TEST_DATABASE_URL = "sqlite:///./test.db"


@pytest.fixture(scope="session")
def engine():
    """Create test database engine."""
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(engine):
    """Create a new database session for a test."""
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def sample_docx_content():
    """Sample DOCX-like content for testing."""
    return """
    Titel: Einwandbehandlung Preis

    ID: OBJ-001

    Einwand: Das ist mir zu teuer.

    Antwort: Ich verstehe Ihre Bedenken bezüglich des Preises.
    Lassen Sie mich Ihnen den Mehrwert erklären...

    Kategorie: Preis
    """


@pytest.fixture
def sample_faq_content():
    """Sample FAQ content for testing."""
    return """
    # FAQ: Produktinstallation

    ## Frage
    Wie installiere ich das Produkt?

    ## Antwort
    1. Laden Sie die Software herunter
    2. Führen Sie das Setup aus
    3. Folgen Sie dem Assistenten

    ## Kategorie
    Installation
    """
