FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8080 \
    MACFETCH_WORK_ROOT=/tmp/macfetch-ios

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

RUN useradd --create-home --uid 10001 macfetch \
    && mkdir -p /tmp/macfetch-ios \
    && chown -R macfetch:macfetch /tmp/macfetch-ios

COPY --chown=macfetch:macfetch server.py /app/server.py
USER macfetch
WORKDIR /app

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8080') + '/health', timeout=3)"
CMD ["python", "server.py"]
