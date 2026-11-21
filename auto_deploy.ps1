$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$wingetPkgs = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"

$git = "git"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  $minGit = Join-Path $wingetPkgs "Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"
  if (Test-Path $minGit) {
    $git = $minGit
    $env:PATH = (Split-Path $minGit) + ";" + $env:PATH
  } else {
    Write-Host "[오류] Git을 찾을 수 없습니다." -ForegroundColor Red
    exit 1
  }
}

$ghBin = Join-Path $wingetPkgs "GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin"
if (Test-Path $ghBin) {
  $env:PATH = $ghBin + ";" + $env:PATH
}

Set-Location $repo

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  한국 날씨에서 살아남기 - 실시간 자동 배포 감시 중" -ForegroundColor Yellow
Write-Host "  파일을 수정/저장하면 3초 뒤 GitHub Pages에 자동 반영!" -ForegroundColor Green
Write-Host "  라이브 주소: https://gunhe7.github.io/korean-weather-survival/" -ForegroundColor White
Write-Host "  종료하려면 Ctrl + C 를 누르세요." -ForegroundColor Gray
Write-Host "=====================================================" -ForegroundColor Cyan

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $repo
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'

$script:dirty = $false
$script:lastChange = Get-Date

$onChange = {
  $p = $Event.SourceEventArgs.FullPath
  if ($p -match '\\\.git\\' -or $p -match '\\\.git$' -or $p -match '\.(bat|ps1|log|tmp)$') { return }
  $script:dirty = $true
  $script:lastChange = Get-Date
}

$subs = @(
  Register-ObjectEvent $watcher Changed -Action $onChange
  Register-ObjectEvent $watcher Created -Action $onChange
  Register-ObjectEvent $watcher Deleted -Action $onChange
  Register-ObjectEvent $watcher Renamed -Action $onChange
)

try {
  while ($true) {
    Start-Sleep -Milliseconds 600
    if ($script:dirty -and ((Get-Date) - $script:lastChange).TotalSeconds -ge 3) {
      $script:dirty = $false
      & $git add -A
      & $git diff --cached --quiet
      if ($LASTEXITCODE -ne 0) {
        $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Write-Host "`n[$stamp] 변경 감지 -> GitHub 자동 업로드 중..." -ForegroundColor Cyan
        & $git commit -m "Auto update ($stamp)"
        & $git push origin main
        if ($LASTEXITCODE -eq 0) {
          Write-Host "[$stamp] 업로드 완료! 약 30~60초 후 라이브 사이트에 반영됩니다." -ForegroundColor Green
        } else {
          Write-Host "[$stamp] 푸시 실패! 네트워크나 GitHub 로그인 상태를 확인해주세요." -ForegroundColor Red
        }
      }
    }
  }
} finally {
  foreach ($s in $subs) { Unregister-Event -SubscriptionId $s.Id -ErrorAction SilentlyContinue }
  $watcher.Dispose()
}
