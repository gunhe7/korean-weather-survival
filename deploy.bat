@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "WINGET_PKGS=%LOCALAPPDATA%\Microsoft\WinGet\Packages"
set "GIT_CMD=git"
where git >nul 2>&1
if errorlevel 1 (
  if exist "%WINGET_PKGS%\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe" (
    set "GIT_CMD=%WINGET_PKGS%\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"
    set "PATH=%WINGET_PKGS%\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd;%PATH%"
  ) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
  ) else (
    echo [오류] Git을 찾을 수 없습니다.
    pause
    exit /b 1
  )
)

if exist "%WINGET_PKGS%\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe" (
  set "PATH=%WINGET_PKGS%\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin;%PATH%"
)

echo ==============================================
echo   한국 날씨에서 살아남기 - GitHub Pages 배포
echo ==============================================
"%GIT_CMD%" status --short
"%GIT_CMD%" add -A

"%GIT_CMD%" diff --cached --quiet
if %errorlevel%==0 (
  echo 변경된 파일이 없습니다. 최신 상태입니다!
  pause
  exit /b 0
)

for /f "tokens=1-3 delims=/- " %%a in ("%date%") do set "TODAY=%%a-%%b-%%c"
"%GIT_CMD%" commit -m "Update game (%TODAY% %time:~0,5%)"
if errorlevel 1 (
  echo [오류] 커밋에 실패했습니다.
  pause
  exit /b 1
)

"%GIT_CMD%" push origin main
if errorlevel 1 (
  echo [오류] 푸시에 실패했습니다. GitHub 로그인 상태를 확인해주세요.
  pause
  exit /b 1
)

echo.
echo [완료] GitHub에 업로드되었습니다!
echo 약 30초~1분 뒤 GitHub Pages 링크에 자동 반영됩니다.
pause
