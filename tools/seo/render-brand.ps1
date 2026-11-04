$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$assets = Join-Path $root 'src/assets'
$brand = Join-Path $PSScriptRoot 'brand'
$logo = [System.Drawing.Image]::FromFile((Join-Path $brand 'logo-source.png'))
$art = [System.Drawing.Image]::FromFile((Join-Path $brand 'architecture-source.png'))
$entries = Get-Content -Raw (Join-Path $PSScriptRoot 'image-prompts.json') | ConvertFrom-Json

function New-Canvas([int]$width, [int]$height) {
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Icon([int]$size, [string]$path) {
    $canvas = New-Canvas $size $size
    $canvas.Graphics.DrawImage($logo, 0, 0, $size, $size)
    $canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Graphics.Dispose()
    $canvas.Bitmap.Dispose()
}

Save-Icon 512 (Join-Path $assets 'logo.png')
Save-Icon 64 (Join-Path $assets 'favicon.png')
Save-Icon 180 (Join-Path $assets 'apple-touch-icon.png')
$hero = New-Canvas 1200 630
$hero.Graphics.DrawImage($art, 0, 0, 1200, 630)
$hero.Bitmap.Save((Join-Path $assets 'architecture.jpg'), [System.Drawing.Imaging.ImageFormat]::Jpeg)
$hero.Graphics.Dispose()
$hero.Bitmap.Dispose()
foreach ($size in @(48, 72, 96, 128, 192, 256, 512)) {
    Save-Icon $size (Join-Path $assets "icons/icon-$size.png")
}

$white = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f2f6f8'))
$mint = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#75e8c8'))
$muted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#a9b9c2'))
$titleFont = New-Object System.Drawing.Font('Segoe UI', 52, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brandFont = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$smallFont = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$quality = New-Object System.Drawing.Imaging.EncoderParameters(1)
$quality.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]90)
foreach ($entry in $entries) {
    $canvas = New-Canvas 1200 630
    $g = $canvas.Graphics
    $g.DrawImage($art, 0, 0, 1200, 630)
    $g.DrawImage($logo, 64, 60, 52, 52)
    $g.DrawString('Coder', $brandFont, $white, 128, 65)
    $g.DrawString($entry.category.ToUpperInvariant(), $smallFont, $mint, 72, 174)
    $y = 221
    foreach ($line in $entry.lines) {
        $g.DrawString($line, $titleFont, $white, 68, $y)
        $y += 65
    }
    $g.FillRectangle($mint, 72, 451, 44, 3)
    $g.DrawString('Build with understanding.', $smallFont, $muted, 72, 478)
    $g.DrawString('coder.webart.work', $smallFont, $muted, 72, 553)
    $label = '{0:D2} / CODER' -f $entry.edition
    $g.DrawString($label, $smallFont, $muted, 1000, 553)
    $canvas.Bitmap.Save((Join-Path $root $entry.file), $jpeg, $quality)
    $g.Dispose()
    $canvas.Bitmap.Dispose()
}
$logo.Dispose()
$art.Dispose()
foreach ($resource in @($white, $mint, $muted, $titleFont, $brandFont, $smallFont, $quality)) { $resource.Dispose() }
Write-Output "Rendered $($entries.Count) social covers, logo, favicon, touch icon and 7 app icons."
