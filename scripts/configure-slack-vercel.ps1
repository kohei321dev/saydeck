[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Read-SecretText {
  param([Parameter(Mandatory)][string]$Prompt)

  $secureValue = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)

  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Set-VercelProductionEnvironmentVariable {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Value
  )

  $Value | & npx.cmd --yes vercel@latest env add $Name production --force --sensitive --yes
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set $Name in Vercel."
  }
}

try {
  Write-Host "SayDeck Slack setup" -ForegroundColor Cyan
  Write-Host "Secret input stays hidden. Paste the value, then press Enter."

  $botToken = Read-SecretText "1/3 Bot User OAuth Token (xoxb-...) from OAuth & Permissions"
  if ($botToken -notmatch "^xoxb-") {
    throw "Bot User OAuth Token must start with xoxb-."
  }

  $authorization = Invoke-RestMethod `
    -Method Post `
    -Uri "https://slack.com/api/auth.test" `
    -Headers @{ Authorization = "Bearer $botToken" }
  if (-not $authorization.ok) {
    throw "Slack rejected the Bot User OAuth Token: $($authorization.error)"
  }

  $teamId = [string]$authorization.team_id
  Write-Host "Workspace verified: $($authorization.team) ($teamId)" -ForegroundColor Green

  $signingSecret = Read-SecretText "2/3 Signing Secret from Basic Information > App Credentials"
  if ([string]::IsNullOrWhiteSpace($signingSecret)) {
    throw "Signing Secret is empty."
  }

  Write-Host "In Slack, open your profile, select the three-dot menu, and choose Copy member ID."
  $ownerUserId = (Read-Host "3/3 Your Slack member ID (starts with U or W)").Trim()
  if ($ownerUserId -notmatch "^[UW][A-Z0-9]+$") {
    throw "Slack member ID must start with U or W."
  }

  Set-VercelProductionEnvironmentVariable "SLACK_BOT_TOKEN" $botToken
  Set-VercelProductionEnvironmentVariable "SLACK_SIGNING_SECRET" $signingSecret
  Set-VercelProductionEnvironmentVariable "SLACK_OWNER_USER_ID" $ownerUserId
  Set-VercelProductionEnvironmentVariable "SLACK_OWNER_TEAM_ID" $teamId

  Write-Host ""
  Write-Host "SUCCESS: Slack settings were saved to Vercel Production." -ForegroundColor Green
  Write-Host "Reply to Codex with: Vercel Slack settings complete"
}
catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Report only the ERROR text. Never paste a token or secret into chat."
  exit 1
}
finally {
  $botToken = $null
  $signingSecret = $null
  $ownerUserId = $null
}
