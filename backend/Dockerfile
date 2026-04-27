FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make startup scripts executable
RUN chmod +x start.sh migrate.sh

# Expose port (cloud hosts usually inject $PORT)
EXPOSE 8000

# Start application. Run ./migrate.sh as an explicit deploy step before rollout.
CMD ["./start.sh"]
