Set-Location $PSScriptRoot

$exts = @('.jpg','.jpeg','.png','.gif','.webp','.bmp','.avif')
$files = Get-ChildItem -Path '.\photos' -File |
    Where-Object { $exts -contains $_.Extension.ToLower() } |
    Sort-Object Name |
    Select-Object -ExpandProperty Name

if (-not $files) {
    Write-Host "photos/ folder is empty." -ForegroundColor Yellow
    exit 1
}

$arr = @($files)
$json = $arr | ConvertTo-Json
if ($arr.Count -eq 1) { $json = "[$json]" }

[System.IO.File]::WriteAllText("$PSScriptRoot\photos.json", $json, [System.Text.Encoding]::UTF8)
Write-Host "Done! $($arr.Count) photos -> photos.json" -ForegroundColor Green
