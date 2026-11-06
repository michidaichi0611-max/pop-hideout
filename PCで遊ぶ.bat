@echo off
rem ポップ・ハイドアウトをPCで遊ぶ（全機能）。このPCからだけ見える小さなサーバーを起動してブラウザで開く。
rem 終わるときはこの黒い窓を閉じる。Python が必要。
cd /d "%~dp0"
start "" http://localhost:8000/
python -m http.server 8000 --bind 127.0.0.1
pause
