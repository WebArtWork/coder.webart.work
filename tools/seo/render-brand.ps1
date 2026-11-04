param([switch]$SeoOnly)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$assets = Join-Path $root 'src/assets'
$brand = Join-Path $PSScriptRoot 'brand'
$logo = [System.Drawing.Image]::FromFile((Join-Path $brand 'logo-source.png'))
$art = [System.Drawing.Image]::FromFile((Join-Path $brand 'architecture-source.png'))
$generation = Get-Content -Raw (Join-Path $brand 'generation-prompts.json') | ConvertFrom-Json
$seoArtPath = if ($generation.seoArtworkSource) { Join-Path $root $generation.seoArtworkSource } else { Join-Path $brand 'architecture-source.png' }
$seoArt = [System.Drawing.Image]::FromFile($seoArtPath)
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

if (-not $SeoOnly) {
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
function Wrap-Title($lines, $graphics, $font) {
    $wrapped = [System.Collections.Generic.List[string]]::new()
    foreach ($line in $lines) {
        $current = ''
        foreach ($word in ([string]$line -split ' ')) {
            $candidate = ($current + ' ' + $word).Trim()
            if ($current -and $graphics.MeasureString($candidate, $font).Width -gt 500) {
                $wrapped.Add($current)
                $current = $word
            } else { $current = $candidate }
        }
        if ($current) { $wrapped.Add($current) }
    }
    return $wrapped.ToArray()
}

foreach ($entry in $entries) {
    $canvas = New-Canvas 1200 630
    $g = $canvas.Graphics
    $g.DrawImage($seoArt, 0, 0, 1200, 630)
    $g.DrawImage($logo, 64, 60, 52, 52)
    $g.DrawString('Coder', $brandFont, $white, 128, 65)
    $g.DrawString($entry.category.ToUpperInvariant(), $smallFont, $mint, 72, 174)
    $fontSize = 52
    do {
        $entryFont = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $titleLines = @(Wrap-Title $entry.lines $g $entryFont)
        if ($titleLines.Count -le 3) { break }
        $entryFont.Dispose()
        $fontSize -= 2
    } while ($fontSize -ge 36)
    if ($titleLines.Count -gt 3) { throw "Title does not fit: $($entry.file)" }
    $y = 221
    foreach ($line in $titleLines) {
        if ($g.MeasureString([string]$line, $entryFont).Width -gt 500) { throw "Title exceeds safe text area: $($entry.file): $line" }
        $g.DrawString($line, $entryFont, $white, 68, $y)
        $y += 65
    }
    $g.FillRectangle($mint, 72, 451, 44, 3)
    $g.DrawString('Build with understanding.', $smallFont, $muted, 72, 478)
    $g.DrawString('coder.webart.work', $smallFont, $muted, 72, 553)
    $label = '{0:D2} / CODER' -f $entry.edition
    $g.DrawString($label, $smallFont, $muted, 1000, 553)
    $canvas.Bitmap.Save((Join-Path $root $entry.file), $jpeg, $quality)
    $entryFont.Dispose()
    $g.Dispose()
    $canvas.Bitmap.Dispose()
}
$logo.Dispose()
$art.Dispose()
$seoArt.Dispose()
foreach ($resource in @($white, $mint, $muted, $titleFont, $brandFont, $smallFont, $quality)) { $resource.Dispose() }
if ($SeoOnly) { Write-Output "Regenerated $($entries.Count) social covers; logo, hero and app icons preserved." }
else { Write-Output "Rendered $($entries.Count) social covers, logo, favicon, touch icon and 7 app icons." }
