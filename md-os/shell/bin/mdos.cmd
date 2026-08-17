@echo off
where py >nul 2>nul
if not errorlevel 1 goto mdos_use_py
where python >nul 2>nul
if not errorlevel 1 goto mdos_use_python
echo ERROR: Python 3 was not found in PATH. 1>&2
exit /b 69

:mdos_use_py
py -3 "%~dp0mdos" %*
exit /b %errorlevel%

:mdos_use_python
python "%~dp0mdos" %*
exit /b %errorlevel%
