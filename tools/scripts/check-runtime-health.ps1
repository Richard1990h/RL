param(
  [string]$SiteUrl = "http://127.0.0.1:4500/",
  [string]$BridgeUrl = "http://127.0.0.1:9876/",
  [string]$WatchdogUrl = "http://127.0.0.1:9877/api/status"
)

function Test-Url($url) {
  try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    return @{ ok = $true; detail = "HTTP $($res.StatusCode)" }
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      if ($status -ge 200 -and $status -lt 500) {
        return @{ ok = $true; detail = "HTTP $status" }
      }
      return @{ ok = $false; detail = "HTTP $status" }
    }
    return @{ ok = $false; detail = $_.Exception.Message }
  }
}

$website = Test-Url $SiteUrl
$bridge = Test-Url $BridgeUrl
$watchdog = Test-Url $WatchdogUrl
$cloudflare = @{ ok = $false; detail = "watchdog unavailable" }

if ($watchdog.ok) {
  try {
    $wd = Invoke-RestMethod -Uri $WatchdogUrl -TimeoutSec 5
    $cf = $wd.services.cloudflare.status
    if ($cf) {
      $cloudflare = @{
        ok = ($cf -eq "running")
        detail = "watchdog=$cf"
      }
    } else {
      $cloudflare = @{ ok = $false; detail = "cloudflare status missing" }
    }
  } catch {
    $cloudflare = @{ ok = $false; detail = "status parse failed" }
  }
}

$allOk = $website.ok -and $bridge.ok -and $watchdog.ok -and $cloudflare.ok

Write-Host "Runtime health check"
Write-Host "  website    : $(if($website.ok){'OK'}else{'FAIL'}) - $($website.detail)"
Write-Host "  bridge     : $(if($bridge.ok){'OK'}else{'FAIL'}) - $($bridge.detail)"
Write-Host "  watchdog   : $(if($watchdog.ok){'OK'}else{'FAIL'}) - $($watchdog.detail)"
Write-Host "  cloudflare : $(if($cloudflare.ok){'OK'}else{'FAIL'}) - $($cloudflare.detail)"

if (-not $allOk) {
  exit 1
}
