# Split the 2172x724 music sprite sheet into 6 frames of 362x724 each,
# and remove the light gray/white background by making matching pixels
# transparent. Run from the repo root.
#
# Output: frames/music/music_01.png ... music_06.png
#
# Rules for what counts as "background":
#   - All three channels must be >= 232 (very bright)
#   - The max channel minus the min channel must be <= 6 (neutral gray)
# This filters out skin highlights / hair shine that share one white
# channel with the background, while keeping the actual background
# (F0-FE in all channels, balanced).
param(
  [string]$Source = "D:\VibeCoding\DeskPet\frames\music\music1-6.png",
  [string]$OutDir = "D:\VibeCoding\DeskPet\frames\music"
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($Source)
$frameCount = 6
$frameWidth = [int]($src.Width / $frameCount)
$frameHeight = $src.Height
Write-Host "Source: $($src.Width)x$($src.Height), frames: $frameCount @ ${frameWidth}x$frameHeight"

$bgRMin = 232
$neutralityRange = 6

function Test-BackgroundPixel($argb) {
  $r = ($argb -shr 16) -band 0xFF
  $g = ($argb -shr 8) -band 0xFF
  $b = $argb -band 0xFF
  if ($r -lt $bgRMin -or $g -lt $bgRMin -or $b -lt $bgRMin) { return $false }
  $maxC = [Math]::Max($r, [Math]::Max($g, $b))
  $minC = [Math]::Min($r, [Math]::Min($g, $b))
  return ($maxC - $minC) -le $neutralityRange
}

for ($i = 0; $i -lt $frameCount; $i++) {
  $dst = New-Object System.Drawing.Bitmap $frameWidth, $frameHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  for ($y = 0; $y -lt $frameHeight; $y++) {
    for ($x = 0; $x -lt $frameWidth; $x++) {
      $srcX = $i * $frameWidth + $x
      $srcArgb = $src.GetPixel($srcX, $y).ToArgb()
      if (Test-BackgroundPixel $srcArgb) {
        $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      } else {
        # Re-emit as opaque. Convert the source RGB (which ignored alpha)
        # to opaque ARGB so the saved PNG carries alpha properly.
        $r = ($srcArgb -shr 16) -band 0xFF
        $g = ($srcArgb -shr 8) -band 0xFF
        $b = $srcArgb -band 0xFF
        $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $r, $g, $b))
      }
    }
  }
  $name = "music_{0:D2}.png" -f ($i + 1)
  $path = Join-Path $OutDir $name
  $dst.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  Write-Host "wrote $path"
}

$src.Dispose()
