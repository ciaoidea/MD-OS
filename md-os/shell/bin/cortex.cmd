@echo off
where py >nul 2>nul
if not errorlevel 1 goto cortex_use_py
where python >nul 2>nul
if not errorlevel 1 goto cortex_use_python
echo ERROR: Python 3 was not found in PATH. 1>&2
exit /b 69

:cortex_use_py
py -3 "%~dp0cortex" %*
exit /b %errorlevel%

:cortex_use_python
python "%~dp0cortex" %*
exit /b %errorlevel%
