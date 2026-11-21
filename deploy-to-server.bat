@echo off
REM TvMaster - Remote Docker Server Deployment Script
set TARGET=%1
if "%TARGET%"=="" set TARGET=10.0.0.130

set REMOTE_USER=%2
if "%REMOTE_USER%"=="" set REMOTE_USER=root

echo =======================================================
echo   Deploying TvMaster v1.0.0 to %REMOTE_USER%@%TARGET%
echo =======================================================
echo.

echo [1/3] Packaging TvMaster source...
tar --exclude=".git" --exclude="node_modules" --exclude="update.tar.gz" -czf tvmaster-update.tar.gz .

echo [2/3] Uploading archive to %TARGET%:/tmp/...
scp tvmaster-update.tar.gz %REMOTE_USER%@%TARGET%:/tmp/

echo [3/3] Extracting and running Docker Compose on remote server...
ssh %REMOTE_USER%@%TARGET% "mkdir -p /opt/tvmaster && tar -xzf /tmp/tvmaster-update.tar.gz -C /opt/tvmaster && rm -f /tmp/tvmaster-update.tar.gz && cd /opt/tvmaster && docker compose up -d --build --remove-orphans"

if exist tvmaster-update.tar.gz del /f /q tvmaster-update.tar.gz

echo.
echo =======================================================
echo   TvMaster Deployment Complete!
echo   Web Dashboard: http://%TARGET%:3055
echo =======================================================
