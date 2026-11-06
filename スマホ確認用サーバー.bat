@echo off
rem 同じWi-Fiのスマホから遊ぶための簡易サーバー（Python が必要）。
rem スマホのブラウザで http://<このPCのIPアドレス>:8000/ を開く。終了はこの窓を閉じる。
rem 注意：起動中は同じネットワークの他の端末からもこのフォルダが見えます。
cd /d "%~dp0"
ipconfig | findstr /i "IPv4"
python -m http.server 8000 --bind 0.0.0.0
pause
