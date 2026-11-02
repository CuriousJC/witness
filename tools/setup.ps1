$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$toolDir = Join-Path $repoRoot '.tools'
New-Item -ItemType Directory -Force $toolDir | Out-Null
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is required for this setup. Alternatively put yt-dlp on PATH.'
}
# Pin both downloads to the same release, even if latest changes between requests.
$release = gh api repos/yt-dlp/yt-dlp/releases/latest --jq .tag_name
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the yt-dlp release.' }
$downloadDir = Join-Path $toolDir ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $downloadDir | Out-Null
gh release download $release --repo yt-dlp/yt-dlp --pattern yt-dlp.exe --pattern SHA2-256SUMS --dir $downloadDir
if ($LASTEXITCODE -ne 0) { throw "Download failed; partial files are in $downloadDir" }
$binary = Join-Path $downloadDir 'yt-dlp.exe'
$checksumLine = Get-Content (Join-Path $downloadDir 'SHA2-256SUMS') | Where-Object { $_ -match '\s+\*?yt-dlp\.exe$' }
if (@($checksumLine).Count -ne 1) { throw 'No unique checksum for yt-dlp.exe.' }
$expected = ($checksumLine -split '\s+')[0]
$actual = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'yt-dlp checksum mismatch; executable was not installed.' }
Move-Item -LiteralPath $binary -Destination (Join-Path $toolDir 'yt-dlp.exe') -Force
# Only the two known download files and the now-empty directory are removed.
Remove-Item -LiteralPath (Join-Path $downloadDir 'SHA2-256SUMS')
Remove-Item -LiteralPath $downloadDir
Write-Output "Installed verified yt-dlp $release in $toolDir"
