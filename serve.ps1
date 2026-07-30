param(
    [int]$Port = 8843,
    [string]$Root = "$PSScriptRoot\app"
)

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root at http://localhost:$Port/  (Ctrl+C to stop)"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        try {
            $urlPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
            if ($urlPath -eq "/") { $urlPath = "/index.html" }
            $filePath = Join-Path $Root ($urlPath.TrimStart("/"))
            $fullRoot = (Resolve-Path $Root).Path
            $resolved = [System.IO.Path]::GetFullPath($filePath)

            if (-not $resolved.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                $response.StatusCode = 403
                $response.Close()
                continue
            }

            if (Test-Path $resolved -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($resolved).ToLower()
                $contentType = $mimeMap[$ext]
                if (-not $contentType) { $contentType = "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($resolved)
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
                $response.OutputStream.Write($msg, 0, $msg.Length)
            }
        } catch {
            $response.StatusCode = 500
        } finally {
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
