@echo off
setlocal

set "ROOT=%~dp0"
set "PANEL_URL=file:///%ROOT:\=/%tools/gamepad_serial_bridge/index.html?transport=native-bridge"
start "" "%PANEL_URL%"
