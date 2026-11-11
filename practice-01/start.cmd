@echo off
python "%~dp0preview_server.py" start
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8000/"
