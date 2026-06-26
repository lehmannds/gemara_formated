$procs = Get-Process -Name "node" -ErrorAction SilentlyContinue |
    Where-Object {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
            $cmd -match 'server\.js'
        } catch { $false }
    }

foreach ($proc in $procs) {
    Write-Host "Killing node server (PID $($proc.Id))..."
    Stop-Process -Id $proc.Id -Force
}

Start-Sleep -Seconds 1
Write-Host "Starting server..."
node server.js
