@echo off
cd /d "%~dp0"
start "Thrust-Zarch server (close to stop)" /min python -m http.server 8765 --bind 127.0.0.1
timeout /t 2 >nul
start "" http://127.0.0.1:8765/
