using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using Microsoft.Win32;

namespace TknHardwareService {
  public sealed class HardwareService : ServiceBase {
    private HttpListener listener;
    private Thread worker;
    private volatile bool stopping;
    private readonly string configPath;
    private Config config;

    public HardwareService() {
      ServiceName = "TKNHardwareService";
      CanStop = true;
      CanShutdown = true;
      AutoLog = true;
      configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
    }

    protected override void OnStart(string[] args) { StartServer(); }
    protected override void OnStop() { StopServer(); }
    protected override void OnShutdown() { StopServer(); base.OnShutdown(); }

    public void RunConsole() {
      StartServer();
      Console.WriteLine("TKN Hardware Service is running. Press Enter to stop.");
      Console.ReadLine();
      StopServer();
    }

    private void StartServer() {
      config = Config.Load(configPath);
      stopping = false;
      listener = new HttpListener();
      listener.Prefixes.Add("http://127.0.0.1:" + config.Port + "/");
      listener.Start();
      worker = new Thread(ListenLoop) { IsBackground = true, Name = "TKN Hardware HTTP" };
      worker.Start();
    }

    private void StopServer() {
      stopping = true;
      try { if (listener != null && listener.IsListening) listener.Stop(); } catch { }
      try { if (listener != null) listener.Close(); } catch { }
      try { if (worker != null && worker.IsAlive) worker.Join(2000); } catch { }
    }

    private void ListenLoop() {
      while (!stopping && listener != null && listener.IsListening) {
        try {
          var context = listener.GetContext();
          ThreadPool.QueueUserWorkItem(_ => Handle(context));
        } catch (HttpListenerException) { if (!stopping) Thread.Sleep(100); }
        catch { if (!stopping) Thread.Sleep(100); }
      }
    }

    private void Handle(HttpListenerContext ctx) {
      try {
        AddCors(ctx);
        if (ctx.Request.HttpMethod == "OPTIONS") { ctx.Response.StatusCode = 204; return; }
        var path = ctx.Request.Url.AbsolutePath.TrimEnd('/').ToLowerInvariant();
        if (path == "") path = "/";

        if (ctx.Request.HttpMethod == "GET" && path == "/health") {
          Json(ctx, 200, "{\"ok\":true,\"service\":\"tkn-hardware-service\",\"version\":\"1.0.0\",\"printer\":\"" + J(config.PrinterName) + "\",\"port\":" + config.Port + "}");
          return;
        }
        if (ctx.Request.HttpMethod == "GET" && path == "/printers") {
          var names = PrinterNative.GetInstalledPrinters();
          var sb = new StringBuilder("{\"ok\":true,\"printers\":[");
          for (int i=0;i<names.Count;i++) { if(i>0) sb.Append(','); sb.Append('\"').Append(J(names[i])).Append('\"'); }
          sb.Append("]}"); Json(ctx,200,sb.ToString()); return;
        }
        if (ctx.Request.HttpMethod == "POST" && path == "/drawer") {
          bool ok=false; int err=0;
          foreach (var cmd in config.DrawerCommands()) {
            if (PrinterNative.Send(config.PrinterName, cmd, out err)) { ok=true; break; }
          }
          if (!ok) { Json(ctx,500,"{\"ok\":false,\"error\":\"drawer command failed\",\"win32_error\":"+err+"}"); return; }
          Json(ctx,200,"{\"ok\":true,\"action\":\"drawer\",\"printer\":\""+J(config.PrinterName)+"\"}"); return;
        }
        if (ctx.Request.HttpMethod == "POST" && path == "/print/raw") {
          string body; using(var sr=new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding ?? Encoding.UTF8)) body=sr.ReadToEnd();
          string b64=ExtractJsonString(body,"data_base64");
          if (String.IsNullOrWhiteSpace(b64)) { Json(ctx,400,"{\"ok\":false,\"error\":\"data_base64 required\"}"); return; }
          byte[] data; try { data=Convert.FromBase64String(b64); } catch { Json(ctx,400,"{\"ok\":false,\"error\":\"invalid base64\"}"); return; }
          int err; bool ok=PrinterNative.Send(config.PrinterName,data,out err);
          if(!ok){ Json(ctx,500,"{\"ok\":false,\"error\":\"print failed\",\"win32_error\":"+err+"}"); return; }
          Json(ctx,200,"{\"ok\":true,\"action\":\"print_raw\",\"bytes\":"+data.Length+"}"); return;
        }
        Json(ctx,404,"{\"ok\":false,\"error\":\"not found\"}");
      } catch(Exception ex) { try { Json(ctx,500,"{\"ok\":false,\"error\":\""+J(ex.Message)+"\"}"); } catch { } }
      finally { try { ctx.Response.Close(); } catch { } }
    }

    private static string ExtractJsonString(string json,string key) {
      string marker="\""+key+"\""; int p=json.IndexOf(marker,StringComparison.OrdinalIgnoreCase); if(p<0)return null;
      p=json.IndexOf(':',p+marker.Length); if(p<0)return null; p=json.IndexOf('"',p+1); if(p<0)return null;
      int e=p+1; var sb=new StringBuilder(); bool esc=false;
      for(;e<json.Length;e++){ char c=json[e]; if(esc){ sb.Append(c); esc=false; continue;} if(c=='\\'){esc=true;continue;} if(c=='"')return sb.ToString(); sb.Append(c);} return null;
    }
    private static void AddCors(HttpListenerContext c) {
      string origin=c.Request.Headers["Origin"]; if(String.IsNullOrWhiteSpace(origin)) origin="*";
      c.Response.Headers["Access-Control-Allow-Origin"]=origin; c.Response.Headers["Vary"]="Origin";
      c.Response.Headers["Access-Control-Allow-Headers"]="Content-Type";
      c.Response.Headers["Access-Control-Allow-Methods"]="GET,POST,OPTIONS";
      c.Response.Headers["Access-Control-Allow-Private-Network"]="true";
      c.Response.Headers["Cache-Control"]="no-store";
    }
    private static void Json(HttpListenerContext c,int code,string json) {
      byte[] b=Encoding.UTF8.GetBytes(json); c.Response.StatusCode=code; c.Response.ContentType="application/json; charset=utf-8"; c.Response.ContentLength64=b.Length; c.Response.OutputStream.Write(b,0,b.Length);
    }
    private static string J(string s){ return (s??"").Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","\\r").Replace("\n","\\n"); }

    public static void Main(string[] args) {
      if (Environment.UserInteractive || (args.Length>0 && args[0].Equals("--console",StringComparison.OrdinalIgnoreCase))) new HardwareService().RunConsole();
      else ServiceBase.Run(new HardwareService());
    }
  }

  public sealed class Config {
    public int Port=17890; public string PrinterName="RONGTA 80mm Series Printer"; public bool TryPin5=true;
    public static Config Load(string path) {
      var c=new Config(); if(!File.Exists(path)){ File.WriteAllText(path,c.ToJson(),new UTF8Encoding(false)); return c; }
      string j=File.ReadAllText(path); c.Port=IntVal(j,"port",c.Port); c.PrinterName=StrVal(j,"printer_name",c.PrinterName); c.TryPin5=BoolVal(j,"try_pin5",true); return c;
    }
    public IEnumerable<byte[]> DrawerCommands(){ yield return new byte[]{27,112,0,25,250}; if(TryPin5) yield return new byte[]{27,112,1,25,250}; }
    public string ToJson(){ return "{\r\n  \"port\": "+Port+",\r\n  \"printer_name\": \""+PrinterName.Replace("\\","\\\\").Replace("\"","\\\"")+"\",\r\n  \"try_pin5\": true\r\n}\r\n"; }
    static string StrVal(string j,string k,string d){ string m="\""+k+"\"";int p=j.IndexOf(m,StringComparison.OrdinalIgnoreCase);if(p<0)return d;p=j.IndexOf(':',p);p=j.IndexOf('"',p);if(p<0)return d;int e=j.IndexOf('"',p+1);return e<0?d:j.Substring(p+1,e-p-1);}
    static int IntVal(string j,string k,int d){ string m="\""+k+"\"";int p=j.IndexOf(m,StringComparison.OrdinalIgnoreCase);if(p<0)return d;p=j.IndexOf(':',p)+1;while(p<j.Length&&!Char.IsDigit(j[p]))p++;int e=p;while(e<j.Length&&Char.IsDigit(j[e]))e++;int v;return Int32.TryParse(j.Substring(p,e-p),out v)?v:d;}
    static bool BoolVal(string j,string k,bool d){ string m="\""+k+"\"";int p=j.IndexOf(m,StringComparison.OrdinalIgnoreCase);if(p<0)return d;p=j.IndexOf(':',p)+1;string r=j.Substring(p).TrimStart();return r.StartsWith("true",StringComparison.OrdinalIgnoreCase)?true:r.StartsWith("false",StringComparison.OrdinalIgnoreCase)?false:d;}
  }

  public static class PrinterNative {
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Ansi)] public class DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
    [DllImport("winspool.Drv",EntryPoint="OpenPrinterA",SetLastError=true,CharSet=CharSet.Ansi)] static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
    [DllImport("winspool.Drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.Drv",EntryPoint="StartDocPrinterA",SetLastError=true,CharSet=CharSet.Ansi)] static extern bool StartDocPrinter(IntPtr h,int l,[In]DOCINFOA d);
    [DllImport("winspool.Drv",SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.Drv",SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.Drv",SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.Drv",SetLastError=true)] static extern bool WritePrinter(IntPtr h,byte[] b,int c,out int w);
    public static bool Send(string n,byte[] b,out int err){err=0;IntPtr h;if(!OpenPrinter(n,out h,IntPtr.Zero)){err=Marshal.GetLastWin32Error();return false;}try{var d=new DOCINFOA{pDocName="TKN Hardware Service",pDataType="RAW"};if(!StartDocPrinter(h,1,d)){err=Marshal.GetLastWin32Error();return false;}try{if(!StartPagePrinter(h)){err=Marshal.GetLastWin32Error();return false;}try{int w;bool ok=WritePrinter(h,b,b.Length,out w);if(!ok)err=Marshal.GetLastWin32Error();return ok&&w==b.Length;}finally{EndPagePrinter(h);}}finally{EndDocPrinter(h);}}finally{ClosePrinter(h);}}
    public static List<string> GetInstalledPrinters(){var list=new List<string>();string key=@"Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices";using(var k=Registry.CurrentUser.OpenSubKey(key)){if(k!=null)foreach(string n in k.GetValueNames())list.Add(n);}return list;}
  }
}
