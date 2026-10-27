@echo off
rem ============================================================
rem start.bat - Dienstplanung Web-Interface starten (Windows)
rem ============================================================
rem Aktiviert die virtuelle Umgebung, prueft Abhaengigkeiten
rem und oeffnet das Web-Interface im Browser.
rem
rem Aufruf:
rem   start.bat
rem   start.bat --port 5001
rem   start.bat --no-browser
rem ============================================================

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set VENV_DIR=%SCRIPT_DIR%.envPEP
set PYTHON=%VENV_DIR%\Scripts\python.exe

cd /d "%SCRIPT_DIR%"

rem ── 0. config.py sicherstellen ──────────────────────────────────────────────
if not exist "%SCRIPT_DIR%config.py" (
    if exist "%SCRIPT_DIR%config.py.example" (
        echo   config.py nicht gefunden - wird aus config.py.example erstellt...
        copy "%SCRIPT_DIR%config.py.example" "%SCRIPT_DIR%config.py" >nul
        echo   Bitte SMTP und Dienstzeiten unter Einstellungen konfigurieren.
    ) else (
        echo.
        echo   FEHLER: config.py.example nicht gefunden.
        pause
        exit /b 1
    )
)

rem ── 1. Virtuelle Umgebung sicherstellen ─────────────────────────────────────
if not exist "%PYTHON%" (
    echo   Virtuelle Umgebung nicht gefunden - wird erstellt...

    rem Python-Befehl ermitteln (python oder py-Launcher)
    set PY_CMD=
    python --version >nul 2>&1
    if not errorlevel 1 set PY_CMD=python
    if not defined PY_CMD (
        py --version >nul 2>&1
        if not errorlevel 1 set PY_CMD=py
    )
    if not defined PY_CMD (
        echo.
        echo   FEHLER: Python nicht gefunden.
        echo   Bitte Python 3.9+ installieren: https://www.python.org/downloads/
        echo   Beim Installieren "Add Python to PATH" aktivieren.
        pause
        exit /b 1
    )

    !PY_CMD! -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo.
        echo   FEHLER: Virtuelle Umgebung konnte nicht erstellt werden.
        pause
        exit /b 1
    )
)

rem ── 2. Abhaengigkeiten pruefen und bei Bedarf installieren ──────────────────
"%PYTHON%" -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo   Abhaengigkeiten werden installiert...
    "%PYTHON%" -m pip install -r requirements.txt -q
    if errorlevel 1 (
        echo.
        echo   FEHLER: Installation fehlgeschlagen.
        pause
        exit /b 1
    )
)

rem ── 3. Web-Interface starten ────────────────────────────────────────────────
echo.
echo   Dienstplanung wird gestartet...
echo   Web-Interface: http://localhost:5000
echo.

"%PYTHON%" gui.py %*

if errorlevel 1 (
    echo.
    echo   Programm mit Fehler beendet.
    pause
)
