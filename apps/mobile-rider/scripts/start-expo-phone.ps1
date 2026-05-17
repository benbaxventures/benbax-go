$ErrorActionPreference = 'Stop'

$ipconfig = ipconfig
$addresses = @()

foreach ($line in $ipconfig) {
  if ($line -match 'IPv4 Address[^\:]*:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)') {
    $addresses += $Matches[1]
  }
}

$ip = $addresses |
  Where-Object {
    $_ -notlike '127.*' -and
    $_ -notlike '169.254.*' -and
    $_ -notlike '172.16.*' -and
    $_ -notlike '172.17.*' -and
    $_ -notlike '172.18.*' -and
    $_ -notlike '172.19.*' -and
    $_ -notlike '172.2?.*' -and
    $_ -notlike '172.30.*' -and
    $_ -notlike '172.31.*'
  } |
  Select-Object -First 1

if (-not $ip) {
  throw 'Could not find an active IPv4 address for Expo LAN mode.'
}

$env:REACT_NATIVE_PACKAGER_HOSTNAME = $ip
Write-Host "Starting Expo on $($env:REACT_NATIVE_PACKAGER_HOSTNAME). Put your phone on the same Wi-Fi/network and scan the QR code."

npx.cmd expo start --lan -c
