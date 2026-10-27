FROM python:3.11-slim

WORKDIR /app

# System-Abhängigkeiten für pdfplumber / Pillow + Node.js für JSX-Build
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpoppler-cpp-dev \
    poppler-utils \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Python-Abhängigkeiten
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt keyrings.alt

# Node.js-Abhängigkeiten (eigener Layer → Cache bleibt bei Code-Änderungen erhalten)
COPY package.json .
RUN npm install

# Anwendungscode
COPY . .

# JSX → JS kompilieren (erzeugt static/js/dist/)
RUN npm run build

# config.py ist gitignored – bei fehlendem File Beispiel-Konfiguration verwenden
RUN [ -f config.py ] || cp config.py.example config.py

# Persistente Daten-Verzeichnisse anlegen
RUN mkdir -p PEP_pdf pdf_archiv excel_export ics_export backup logs

EXPOSE 5000

ENV PYTHONUNBUFFERED=1

CMD ["python", "gui.py", "--host", "0.0.0.0", "--no-browser"]
