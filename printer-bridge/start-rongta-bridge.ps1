param(
  [string]$PrinterName = "RONGTA 80mm Series Printer",
  [int]$Port = 17890
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)] public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)] public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, byte[] bytes, int count, out int written);
  public static bool Send(string printer, byte[] bytes) {
    IntPtr h; if(!OpenPrinter(printer,out h,IntPtr.Zero)) return false;
    var di=new DOCINFOA(){pDocName="TKN Cash Drawer",pDataType="RAW"};
    try { if(!StartDocPrinter(h,1,di)) return false; StartPagePrinter(h); int w; bool ok=WritePrinter(h,bytes,bytes.Length,out w); EndPagePrinter(h); EndDocPrinter(h); return ok && w==bytes.Length; }
    finally { ClosePrinter(h); }
  }
}
"@

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "TKN Rongta Bridge running on http://127.0.0.1:$Port/"
Write-Host "Printer: $PrinterName"

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $response = $context.Response
  $response.Headers.Add('Access-Control-Allow-Origin','*')
  $response.Headers.Add('Access-Control-Allow-Headers','Content-Type')
  $response.Headers.Add('Access-Control-Allow-Methods','POST,GET,OPTIONS')
  try {
    if ($context.Request.HttpMethod -eq 'OPTIONS') { $response.StatusCode=204 }
    elseif ($context.Request.Url.AbsolutePath -eq '/health') {
      $bytes=[Text.Encoding]::UTF8.GetBytes('{"ok":true,"printer":"'+$PrinterName+'"}')
      $response.ContentType='application/json'; $response.OutputStream.Write($bytes,0,$bytes.Length)
    }
    elseif ($context.Request.Url.AbsolutePath -eq '/drawer' -and $context.Request.HttpMethod -eq 'POST') {
      # ESC p m t1 t2 — kick drawer pin 2, 50ms on, 500ms off
      $command=[byte[]](27,112,0,25,250)
      $ok=[RawPrinterHelper]::Send($PrinterName,$command)
      if(-not $ok){throw "ส่งคำสั่งไปเครื่องพิมพ์ไม่สำเร็จ"}
      $bytes=[Text.Encoding]::UTF8.GetBytes('{"ok":true}')
      $response.ContentType='application/json'; $response.OutputStream.Write($bytes,0,$bytes.Length)
    }
    else { $response.StatusCode=404 }
  } catch {
    $response.StatusCode=500
    $bytes=[Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"'+$_.Exception.Message.Replace('"','\"')+'"}')
    $response.ContentType='application/json'; $response.OutputStream.Write($bytes,0,$bytes.Length)
  } finally { $response.Close() }
}
