param([switch]$Probe,[string]$Root)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$SynthType = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
$StreamType = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
$ReaderType = [Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
$voices = @($SynthType::AllVoices | Where-Object { $_.Language -eq 'en-US' })
if ($Probe) {
  @{available=($voices.Count -gt 0); voices=@($voices | ForEach-Object { $_.DisplayName }); engine='Windows local speech'} | ConvertTo-Json -Compress
  exit
}
if ($voices.Count -eq 0) { throw 'No installed US English voices.' }
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 -and
  $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($operation, $resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null,@($operation))
  $task.GetAwaiter().GetResult()
}
$request = Get-Content -LiteralPath (Join-Path $Root 'request.json') -Raw | ConvertFrom-Json
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voice = $voices | Where-Object { $_.DisplayName -eq $request.voice } | Select-Object -First 1
if (!$voice) { $voice=$voices[0] }
$synth.Voice=$voice
$stream=$null; $reader=$null
try {
  $stream=Await ($synth.SynthesizeSsmlToStreamAsync([string]$request.ssml)) $StreamType
  if ($stream.Size -gt 4000000) { throw 'Speech line exceeded output limit.' }
  $reader=New-Object Windows.Storage.Streams.DataReader ($stream.GetInputStreamAt(0))
  $null=Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
  $bytes=New-Object byte[] ([int]$stream.Size)
  $reader.ReadBytes($bytes)
  [IO.File]::WriteAllBytes((Join-Path $Root 'line.wav'),$bytes)
  @{voice=$voice.DisplayName; bytes=$bytes.Length} | ConvertTo-Json -Compress
} finally {
  if ($reader) { $reader.Dispose() }; if ($stream) { $stream.Dispose() }; $synth.Dispose()
}
