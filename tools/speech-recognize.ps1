# Local Windows speech recognition. No default microphone access: input is a short WAV from browser PTT.
param([string]$Root, [switch]$Probe)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$info = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Where-Object {$_.Culture.Name -eq 'en-US'} | Select-Object -First 1
if ($Probe) { @{available=[bool]$info; backend='Windows offline'; reason=$(if($info){''}else{'No installed US English speech recognizer.'})} | ConvertTo-Json -Compress; exit }
if (-not $info) { throw 'No installed US English speech recognizer.' }
$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine $info
try {
  $choices = New-Object System.Speech.Recognition.Choices
  $calls = Get-Content -LiteralPath (Join-Path $Root 'calls.json') -Raw | ConvertFrom-Json
  $choices.Add([string[]]$calls)
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture = $info.Culture
  $builder.Append($choices)
  $rec.LoadGrammar((New-Object System.Speech.Recognition.Grammar $builder))
  # Dictation competes with the call grammar so unrelated words are not restricted to a valid order.
  $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $rec.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.4)
  $rec.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1.8)
  $rec.SetInputToWaveFile((Join-Path $Root 'call.wav'))
  $results = @()
  while ($true) {
    try { $r = $rec.Recognize() } catch [System.InvalidOperationException] { break }
    if (-not $r) { break }
    $results += $r
    if ($results.Count -gt 1) { break }
  }
  $alternatives = @()
  if ($results.Count -eq 1) {
    $r = $results[0]
    $weak = @($r.Words | Where-Object {$_.Confidence -lt 0.35}).Count -gt 0
    if ($r.Confidence -ge 0.75 -and -not $weak) {
      $alternatives = @($r.Alternates | Select-Object -First 3 | ForEach-Object { @{transcript=$_.Text; confidence=$_.Confidence} })
      if (-not $alternatives.Count) { $alternatives = @(@{transcript=$r.Text;confidence=$r.Confidence}) }
    }
  }
  @{alternatives=$alternatives; reason=$(if($alternatives.Count){''}elseif($results.Count -gt 1){'Send one complete call per transmission.'}else{'Reception unclear. Say again, including the callsigns and OVER.'})} | ConvertTo-Json -Depth 4 -Compress
} finally { $rec.Dispose() }
