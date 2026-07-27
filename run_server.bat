@echo off
title 機捷快選 - 本機 Web 伺服器
echo ========================================================
echo  正在啟動機捷快選本機 HTTP Web 伺服器 (Port 8080)...
echo  開啟瀏覽器存取: http://localhost:8080
echo ========================================================
python -m http.server 8080
pause
