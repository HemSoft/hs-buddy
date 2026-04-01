$t = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'Eastern Standard Time')
$tz = if ($t.IsDaylightSavingTime()) { 'EDT' } else { 'EST' }
@{ systemMessage = "Timestamp: $($t.ToString('yyyy-MM-dd hh:mm:ss tt')) $tz" } | ConvertTo-Json
