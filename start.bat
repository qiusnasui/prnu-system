@echo off
chcp 65001 >nul
echo ============================================
echo    PRNU 设备指纹溯源系统
echo ============================================
echo.

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

:: 检查依赖
echo [检查] 验证 Python 依赖...
python -c "import flask, numpy, PIL, cv2, scipy" >nul 2>&1
if errorlevel 1 (
    echo [安装] 正在安装依赖包...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo [启动] 正在启动 PRNU 系统...
echo.
echo 访问地址：http://localhost:5000
echo 按 Ctrl+C 停止服务
echo.
echo ============================================
echo.

python app.py
