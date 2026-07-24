param(
  [string]$PrinterName = "RONGTA 80mm Series Printer",
  [int]$Port = 17891
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA",
    SetLastError = true, CharSet = CharSet.Ansi)]
  public static extern bool OpenPrinter(
    string printerName, out IntPtr printerHandle, IntPtr defaults);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr printerHandle);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA",
    SetLastError = true, CharSet = CharSet.Ansi)]
  public static extern bool StartDocPrinter(
    IntPtr printerHandle, int level, [In] DOCINFOA docInfo);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr printerHandle);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr printerHandle);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr printerHandle);

  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool WritePrinter(
    IntPtr printerHandle, byte[] bytes, int count, out int written);

  public static bool Send(string printerName, byte[] bytes, out int errorCode) {
    errorCode = 0;
    IntPtr printerHandle;

    if (!OpenPrinter(printerName, out printerHandle, IntPtr.Zero)) {
      errorCode = Marshal.GetLastWin32Error();
      return false;
    }

    var docInfo = new DOCINFOA {
      pDocName = "TKN Rongta Cash Drawer",
      pDataType = "RAW"
    };

    try {
      if (!StartDocPrinter(printerHandle, 1, docInfo)) {
        errorCode = Marshal.GetLastWin32Error();
        return false;
      }

      try {
        if (!StartPagePrinter(printerHandle)) {
          errorCode = Marshal.GetLastWin32Error();
          return false;
        }

        try {
          int written;
          bool ok = WritePrinter(
            printerHandle, bytes, bytes.Length, out written);

          if (!ok) {
            errorCode = Marshal.GetLastWin32Error();
          }

          return ok && written == bytes.Length;
        }
        finally {
          EndPagePrinter(printerHandle);
        }
      }
      finally {
        EndDocPrinter(printerHandle);
      }
    }
    finally {
      ClosePrinter(printerHandle);
    }
  }
}
"@

function Write-JsonResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [hashtable]$Body
  )

  $json = $Body | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Add-CorsHeaders {
  param(
    [System.Net.HttpListenerRequest]$Request,
    [System.Net.HttpListenerResponse]$Response
  )

  $origin = $Request.Headers["Origin"]
  if ([string]::IsNullOrWhiteSpace($origin)) {
    $origin = "*"
  }

  $Response.Headers["Access-Control-Allow-Origin"] = $origin
  $Response.Headers["Vary"] = "Origin"
  $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
  $Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
  $Response.Headers["Access-Control-Allow-Private-Network"] = "true"
  $Response.Headers["Cache-Control"] = "no-store"
}

$printer = Get-CimInstance Win32_Printer |
  Where-Object { $_.Name -eq $PrinterName } |
  Select-Object -First 1

if (-not $printer) {
  Write-Host ""
  Write-Host "Printer not found: $PrinterName" -ForegroundColor Red
  Write-Host "Installed printers:" -ForegroundColor Yellow
  Get-CimInstance Win32_Printer |
    Select-Object -ExpandProperty Name |
    ForEach-Object { Write-Host " - $_" }
  Write-Host ""
  Write-Host "Edit START-RONGTA-BRIDGE.bat if the printer name differs."
  exit 2
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
  $listener.Start()
}
catch {
  Write-Host ""
  Write-Host "Bridge could not start." -ForegroundColor Red
  Write-Host $_.Exception.Message
  Write-Host "Run START-RONGTA-BRIDGE.bat as Administrator."
  exit 3
}

Write-Host ""
Write-Host "TKN Rongta Bridge is running." -ForegroundColor Green
Write-Host "Health:  http://127.0.0.1:$Port/health"
Write-Host "Drawer:  POST http://127.0.0.1:$Port/drawer"
Write-Host "Printer: $PrinterName"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      Add-CorsHeaders -Request $request -Response $response

      if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 204
        continue
      }

      if ($request.HttpMethod -eq "GET" -and
          $request.Url.AbsolutePath -eq "/health") {
        Write-JsonResponse -Response $response -StatusCode 200 -Body @{
          ok = $true
          service = "tkn-rongta-bridge"
          printer = $PrinterName
          printer_status = [string]$printer.PrinterStatus
          port = $Port
        }
        continue
      }

      if ($request.HttpMethod -eq "POST" -and
          $request.Url.AbsolutePath -eq "/drawer") {
        # ESC/POS: ESC p m t1 t2
        # Pin 2, pulse ON 50 ms, OFF 500 ms.
        [byte[]]$command = 27, 112, 0, 25, 250
        [int]$win32Error = 0

        $ok = [RawPrinterHelper]::Send(
          $PrinterName, $command, [ref]$win32Error)

        if (-not $ok) {
          throw "Printer RAW command failed. Win32 error: $win32Error"
        }

        Write-JsonResponse -Response $response -StatusCode 200 -Body @{
          ok = $true
          action = "drawer"
          printer = $PrinterName
        }
        continue
      }

      Write-JsonResponse -Response $response -StatusCode 404 -Body @{
        ok = $false
        error = "Not found"
      }
    }
    catch {
      Write-JsonResponse -Response $response -StatusCode 500 -Body @{
        ok = $false
        error = $_.Exception.Message
      }
    }
    finally {
      $response.Close()
    }
  }
}
finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}
