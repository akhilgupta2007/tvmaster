@echo off
REM TvMaster v1.0.0 Deployment Script
echo ===================================================
echo   TvMaster v1.0.0 - Android TV Task Manager
echo ===================================================
echo.

WHERE docker >nul 2>nul
IF %ERRORLEVEL% EQU 0 (
    echo [INFO] Docker detected. Building and launching container...
    docker compose up -d --build
    echo.
    echo [SUCCESS] TvMaster is running at http://localhost:3055
    pause
    exit /b 0
)

WHERE node >nul 2>nul
IF %ERRORLEVEL% EQU 0 (
    echo [INFO] Docker not found, but Node.js is installed.
    echo [INFO] Launching directly with local Node.js and ADB...
    call npm install --omit=dev
    node src/server.js
    exit /b 0
)

echo [ERROR] Neither Docker nor Node.js were found on this system.
echo Please install Docker or Node.js to run TvMaster.
pause
exit /b 1
