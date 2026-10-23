# CineMatch - Fire TV App Container
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir fastapi uvicorn pydantic

# Copy project files
COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY data/ ./data/
COPY css/ ./css/
COPY js/ ./js/
COPY assets/ ./assets/
COPY index.html ./index.html

# Expose TV Web Server port
EXPOSE 8000

# Start server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
