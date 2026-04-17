Set-Location $PSScriptRoot
Add-Type -AssemblyName System.Drawing

$thumbDir = "$PSScriptRoot\thumbs"
if (-not (Test-Path $thumbDir)) { New-Item -ItemType Directory -Path $thumbDir | Out-Null }

$exts = @('.jpg','.jpeg','.png','.gif','.webp','.bmp','.avif')
$files = Get-ChildItem -Path '.\photos' -File |
    Where-Object { $exts -contains $_.Extension.ToLower() } |
    Sort-Object Name

if (-not $files) {
    Write-Host "photos/ folder is empty." -ForegroundColor Yellow
    exit 1
}

$maxSize = 600
$i = 0
foreach ($file in $files) {
    $i++
    $thumbPath = "$thumbDir\$($file.Name)"

    if (Test-Path $thumbPath) {
        Write-Host "[$i/$($files.Count)] skip (already exists): $($file.Name)"
        continue
    }

    Write-Host "[$i/$($files.Count)] generating thumb: $($file.Name)"

    try {
        $img = [System.Drawing.Image]::FromFile($file.FullName)
        $w = $img.Width; $h = $img.Height

        if ($w -ge $h) { $nw = $maxSize; $nh = [int]($h * $maxSize / $w) }
        else            { $nh = $maxSize; $nw = [int]($w * $maxSize / $h) }
        if ($nw -lt 1) { $nw = 1 }
        if ($nh -lt 1) { $nh = 1 }

        $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($img, 0, 0, $nw, $nh)
        $g.Dispose()

        $ext = $file.Extension.ToLower()
        if ($ext -eq '.png') {
            $bmp.Save($thumbPath, [System.Drawing.Imaging.ImageFormat]::Png)
        } else {
            $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
                Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
            $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
                [System.Drawing.Imaging.Encoder]::Quality, [long]82)
            $bmp.Save($thumbPath, $jpegCodec, $encParams)
        }

        $bmp.Dispose()
        $img.Dispose()
    } catch {
        Write-Host "  ERROR: $_" -ForegroundColor Red
    }
}

$names = $files | Select-Object -ExpandProperty Name
$arr   = @($names)
$json  = $arr | ConvertTo-Json
if ($arr.Count -eq 1) { $json = "[$json]" }
[System.IO.File]::WriteAllText("$PSScriptRoot\photos.json", $json, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "Done! $($arr.Count) photos -> photos.json + thumbs/" -ForegroundColor Green
