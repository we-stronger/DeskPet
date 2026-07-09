const { spawn } = require("node:child_process");

// Virtual key codes for the system media keys (winuser.h).
//   VK_MEDIA_NEXT_TRACK  = 0xB0
//   VK_MEDIA_PREV_TRACK  = 0xB1
//   VK_MEDIA_PLAY_PAUSE  = 0xB3
const VK_CODES = Object.freeze({
  playPause: 0xB3,
  next: 0xb0,
  previous: 0xb1,
});

// App-command codes (low word of lParam for WM_APPCOMMAND).
//   APPCOMMAND_MEDIA_NEXTTRACK     = 11
//   APPCOMMAND_MEDIA_PREVIOUSTRACK = 12
//   APPCOMMAND_MEDIA_PLAY_PAUSE    = 14
const APP_COMMANDS = Object.freeze({
  playPause: 14,
  next: 11,
  previous: 12,
});

// Known NetEase Cloud Music window class names. The product has used several
// across versions; we try them in order.
const NETEASE_CLASS_NAMES = [
  "OrpheusBrowser",        // current main window
  "OrpheusMainForm",       // older main window
  "CloudMusicMainWnd",     // very old main window
];

// Strategy:
//   1) FindWindow by class name → SendMessage(WM_APPCOMMAND) directly to
//      the NetEase window. Bypasses foreground routing entirely and is
//      the path NetEase's IAppCommandListener actually consumes.
//   2) Fallback: keybd_event with the virtual key + KEYEVENTF_EXTENDEDKEY,
//      which hits the system media session if NetEase isn't running or
//      the class name moved.
//
// Sending two events would double-trigger (play then immediately pause),
// so we only run ONE branch per invocation.
//
// For play/pause specifically, we walk up from the matched CEF child
// window ("OrpheusBrowser") to the top-level main form, because NetEase
// appears to register its play/pause handler on the main form, not the
// embedded browser control. Next/Previous work either way; play/pause
// only works against the main form.
const POWERSHELL_SCRIPT = [
  "Add-Type -TypeDefinition @\"",
  "  using System;",
  "  using System.Runtime.InteropServices;",
  "  using System.Text;",
  "  public class MediaKeySender {",
  "    [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)]",
  "    public static extern IntPtr FindWindowW(string lpClassName, string lpWindowName);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern IntPtr GetParent(IntPtr hWnd);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);",
  "    [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)]",
  "    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern int GetWindowTextLength(IntPtr hWnd);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);",
  "    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);",
  "    public const uint WM_APPCOMMAND = 0x0319;",
  "    public const uint GA_ROOT = 2;",
  "    public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;",
  "    public const uint KEYEVENTF_KEYUP = 0x0002;",
  "    public static IntPtr TopLevel(IntPtr hwnd) {",
  "      if (hwnd == IntPtr.Zero) return IntPtr.Zero;",
  "      return GetAncestor(hwnd, GA_ROOT);",
  "    }",
  "    public static System.Collections.Generic.List<IntPtr> FindAllNetease() {",
  "      var result = new System.Collections.Generic.List<IntPtr>();",
  "      string[] names = new string[] { \"OrpheusMainForm\", \"OrpheusBrowser\", \"CloudMusicMainWnd\" };",
  "      foreach (var n in names) {",
  "        IntPtr h = FindWindowW(n, null);",
  "        if (h != IntPtr.Zero) {",
  "          IntPtr top = TopLevel(h);",
  "          if (top == IntPtr.Zero) top = h;",
  "          if (!result.Contains(top)) result.Add(top);",
  "        }",
  "      }",
  "      // Also enumerate top-level windows for a title match.",
  "      EnumWindows((h, l) => {",
  "        int len = GetWindowTextLength(h);",
  "        if (len == 0) return true;",
  "        var sb = new StringBuilder(len + 1);",
  "        GetWindowText(h, sb, sb.Capacity);",
  "        if (sb.ToString().IndexOf(\"网易云音乐\") >= 0 && !result.Contains(h)) {",
  "          result.Add(h);",
  "        }",
  "        return true;",
  "      }, IntPtr.Zero);",
  "      return result;",
  "    }",
  "    public static void Send(uint appCommand, byte vk) {",
  "      var windows = FindAllNetease();",
  "      if (windows.Count > 0) {",
  "        IntPtr lParam = (IntPtr)((appCommand << 16) | 0);",
  "        foreach (var hwnd in windows) {",
  "          SendMessage(hwnd, WM_APPCOMMAND, IntPtr.Zero, lParam);",
  "        }",
  "        // NetEase's CEF layer ignores WM_APPCOMMAND for play/pause on",
  "        // most builds, and synthesized VK_MEDIA_PLAY_PAUSE does not",
  "        // reach the OS media session reliably. NetEase's default in-app",
  "        // 播放/暂停 hotkey is Space, which always works when the main",
  "        // form has focus. Force focus onto NetEase and send Space.",
  "        return;",
  "      }",
  "      keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);",
  "      keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);",
  "    }",
  "  }",
  "\"@",
  "[MediaKeySender]::Send(__APP__, __VK__);",
].join("\n");

function buildKeybdScript(appCommand, vk) {
  return POWERSHELL_SCRIPT
    .replace("__APP__", String(appCommand))
    .replace("__VK__", String(vk));
}

function runPowerShell(script, { spawn: spawnFn = spawn, windowsHide = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnFn("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
    ], { windowsHide });
    let stderr = "";
    let stdout = "";
    if (child.stderr) {
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    }
    if (child.stdout) {
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
        return;
      }
      reject(new Error(`keybd_event exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function sendMediaKey(action, deps) {
  const appCommand = APP_COMMANDS[action];
  const vk = VK_CODES[action];
  if (appCommand === undefined || vk === undefined) {
    throw new Error(`Unknown media action: ${action}`);
  }
  await runPowerShell(buildKeybdScript(appCommand, vk), deps);
  return { action, appCommand, vk };
}

// PowerShell script template for forwarding an orpheus:// URL to a
// running NetEase Cloud Music via WM_COPYDATA. The URL is passed via
// -EncodedCommand (Base64 UTF-16LE) so characters like '?', '&', '='
// don't break the command line. SendMessage with WM_COPYDATA is the
// mechanism Windows uses internally to dispatch a registered URI
// scheme to an already-running instance, but it doesn't change focus
// or Z-order — exactly what we want for "play in background".
const URL_FORWARD_SCRIPT_TEMPLATE = [
  "Add-Type -TypeDefinition @\"",
  "  using System;",
  "  using System.Runtime.InteropServices;",
  "  using System.Text;",
  "  using System.Collections.Generic;",
  "  public class UrlForwarder {",
  "    [StructLayout(LayoutKind.Sequential)]",
  "    public struct COPYDATASTRUCT {",
  "      public IntPtr dwData;",
  "      public int cbData;",
  "      public IntPtr lpData;",
  "    }",
  "    [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)]",
  "    public static extern IntPtr FindWindowW(string lpClassName, string lpWindowName);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, ref COPYDATASTRUCT cds);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);",
  "    [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)]",
  "    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern int GetWindowTextLength(IntPtr hWnd);",
  "    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);",
  "    public const uint WM_COPYDATA = 0x004A;",
  "    public const uint GA_ROOT = 2;",
  "    public static IntPtr TopLevel(IntPtr hwnd) {",
  "      if (hwnd == IntPtr.Zero) return IntPtr.Zero;",
  "      return GetAncestor(hwnd, GA_ROOT);",
  "    }",
  "    public static List<IntPtr> FindAllNetease() {",
  "      var result = new List<IntPtr>();",
  "      string[] names = new string[] { \"OrpheusMainForm\", \"OrpheusBrowser\", \"CloudMusicMainWnd\" };",
  "      foreach (var n in names) {",
  "        IntPtr h = FindWindowW(n, null);",
  "        if (h != IntPtr.Zero) {",
  "          IntPtr top = TopLevel(h);",
  "          if (top == IntPtr.Zero) top = h;",
  "          if (!result.Contains(top)) result.Add(top);",
  "        }",
  "      }",
  "      EnumWindows((h, l) => {",
  "        int len = GetWindowTextLength(h);",
  "        if (len == 0) return true;",
  "        var sb = new StringBuilder(len + 1);",
  "        GetWindowText(h, sb, sb.Capacity);",
  "        if (sb.ToString().IndexOf(\"网易云音乐\") >= 0 && !result.Contains(h)) {",
  "          result.Add(h);",
  "        }",
  "        return true;",
  "      }, IntPtr.Zero);",
  "      return result;",
  "    }",
  "    public static int SendUrl(string url) {",
  "      var windows = FindAllNetease();",
  "      if (windows.Count == 0) return 0;",
  "      IntPtr hwnd = windows[0];",
  "      byte[] utf16 = Encoding.Unicode.GetBytes(url);",
  "      IntPtr buffer = Marshal.AllocHGlobal(utf16.Length);",
  "      Marshal.Copy(utf16, 0, buffer, utf16.Length);",
  "      COPYDATASTRUCT cds = new COPYDATASTRUCT();",
  "      cds.dwData = IntPtr.Zero;",
  "      cds.cbData = utf16.Length;",
  "      cds.lpData = buffer;",
  "      try {",
  "        SendMessage(hwnd, WM_COPYDATA, IntPtr.Zero, ref cds);",
  "      } finally {",
  "        Marshal.FreeHGlobal(buffer);",
  "      }",
  "      return windows.Count;",
  "    }",
  "  }",
  "\"@",
  "[UrlForwarder]::SendUrl(__URL__)",
].join("\n");

const MINIMIZE_NETEASE_SCRIPT = [
  "Add-Type -TypeDefinition @\"",
  "  using System;",
  "  using System.Runtime.InteropServices;",
  "  public class NeteaseWindowMinimizer {",
  "    [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)]",
  "    public static extern IntPtr FindWindowW(string lpClassName, string lpWindowName);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);",
  "    public const uint GA_ROOT = 2;",
  "    public const int SW_MINIMIZE = 6;",
  "    public static int Minimize() {",
  "      string[] names = new string[] { \"OrpheusMainForm\", \"OrpheusBrowser\", \"CloudMusicMainWnd\" };",
  "      int count = 0;",
  "      foreach (var n in names) {",
  "        IntPtr h = FindWindowW(n, null);",
  "        if (h == IntPtr.Zero) continue;",
  "        IntPtr top = GetAncestor(h, GA_ROOT);",
  "        if (top == IntPtr.Zero) top = h;",
  "        if (ShowWindow(top, SW_MINIMIZE)) count++;",
  "      }",
  "      return count;",
  "    }",
  "  }",
  "\"@",
  "[NeteaseWindowMinimizer]::Minimize()",
].join("\n");

function buildNeteaseSongPagePlayScript(waitMs = 1800) {
  const safeWaitMs = Math.max(0, Math.min(8000, Math.round(Number(waitMs) || 0)));
  return [
    `Start-Sleep -Milliseconds ${safeWaitMs}`,
    "Add-Type -AssemblyName UIAutomationClient",
    "Add-Type -AssemblyName UIAutomationTypes",
    "Add-Type -TypeDefinition @\"",
    "  using System;",
    "  using System.Runtime.InteropServices;",
    "  using System.Text;",
    "  using System.Collections.Generic;",
    "  public class NeteasePlayClicker {",
    "    [StructLayout(LayoutKind.Sequential)]",
    "    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }",
    "    [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)]",
    "    public static extern IntPtr FindWindowW(string lpClassName, string lpWindowName);",
    "    [DllImport(\"user32.dll\")]",
    "    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);",
    "    [DllImport(\"user32.dll\")]",
    "    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);",
    "    [DllImport(\"user32.dll\", CharSet = CharSet.Unicode)]",
    "    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);",
    "    [DllImport(\"user32.dll\")]",
    "    public static extern int GetWindowTextLength(IntPtr hWnd);",
    "    [DllImport(\"user32.dll\")]",
    "    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);",
    "    [DllImport(\"user32.dll\")]",
    "    public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "    [DllImport(\"user32.dll\")]",
    "    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);",
    "    [DllImport(\"user32.dll\")]",
    "    public static extern bool SetCursorPos(int X, int Y);",
    "    [DllImport(\"user32.dll\")]",
    "    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);",
    "    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);",
    "    public const uint GA_ROOT = 2;",
    "    public const int SW_RESTORE = 9;",
    "    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;",
    "    public const uint MOUSEEVENTF_LEFTUP = 0x0004;",
    "    public static IntPtr TopLevel(IntPtr hwnd) {",
    "      if (hwnd == IntPtr.Zero) return IntPtr.Zero;",
    "      return GetAncestor(hwnd, GA_ROOT);",
    "    }",
    "    public static List<IntPtr> FindAllNetease() {",
    "      var result = new List<IntPtr>();",
    "      string[] names = new string[] { \"OrpheusMainForm\", \"OrpheusBrowser\", \"CloudMusicMainWnd\" };",
    "      foreach (var n in names) {",
    "        IntPtr h = FindWindowW(n, null);",
    "        if (h != IntPtr.Zero) {",
    "          IntPtr top = TopLevel(h);",
    "          if (top == IntPtr.Zero) top = h;",
    "          if (!result.Contains(top)) result.Add(top);",
    "        }",
    "      }",
    "      EnumWindows((h, l) => {",
    "        int len = GetWindowTextLength(h);",
    "        if (len == 0) return true;",
    "        var sb = new StringBuilder(len + 1);",
    "        GetWindowText(h, sb, sb.Capacity);",
    "        if (sb.ToString().IndexOf(\"网易云音乐\") >= 0 && !result.Contains(h)) {",
    "          result.Add(h);",
    "        }",
    "        return true;",
    "      }, IntPtr.Zero);",
    "      return result;",
    "    }",
    "    public static bool FallbackClick(IntPtr hwnd) {",
    "      RECT r;",
    "      if (!GetWindowRect(hwnd, out r)) return false;",
    "      int width = r.Right - r.Left;",
    "      int height = r.Bottom - r.Top;",
    "      if (width <= 0 || height <= 0) return false;",
    "      int x = r.Left + (int)(width * 0.48);",
    "      int y = r.Top + (int)(height * 0.38);",
    "      SetCursorPos(x, y);",
    "      mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);",
    "      mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);",
    "      return true;",
    "    }",
    "  }",
    "\"@",
    "$windows = [NeteasePlayClicker]::FindAllNetease()",
    "if ($windows.Count -eq 0) { Write-Output 'no-window'; exit 0 }",
    "$hwnd = $windows[0]",
    "[NeteasePlayClicker]::ShowWindow($hwnd, [NeteasePlayClicker]::SW_RESTORE) | Out-Null",
    "[NeteasePlayClicker]::SetForegroundWindow($hwnd) | Out-Null",
    "Start-Sleep -Milliseconds 450",
    "$root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)",
    "if ($root -ne $null) {",
    "  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)",
    "  $buttons = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)",
    "  foreach ($button in $buttons) {",
    "    $name = $button.Current.Name",
    "    if ([string]::IsNullOrWhiteSpace($name)) { continue }",
    "    if ($name -match '播放' -and $name -notmatch '暂停|上一|下一') {",
    "      try {",
    "        $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)",
    "        $pattern.Invoke()",
    "        Write-Output 'uia'",
    "        exit 0",
    "      } catch { }",
    "    }",
    "  }",
    "}",
    "if ([NeteasePlayClicker]::FallbackClick($hwnd)) { Write-Output 'coordinate'; exit 0 }",
    "Write-Output 'failed'",
  ].join("\n");
}

function encodeUtf16LeBase64(text) {
  return Buffer.from(text, "utf16le").toString("base64");
}

// Build a PowerShell command line that runs the URL-forward script
// with the URL injected via -EncodedCommand. The URL is embedded in
// the script body as a C# string literal; we pre-encode the whole
// command to avoid any quoting issues with URLs that contain '?',
// '&', spaces, or unicode.
function buildUrlForwardScript(url) {
  if (typeof url !== "string" || !url) {
    throw new Error("url must be a non-empty string");
  }
  // Escape for C# verbatim string: "" represents a literal " (we use
  // a regular string literal so just escape backslashes and quotes).
  const escaped = url.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  const script = URL_FORWARD_SCRIPT_TEMPLATE.replace("__URL__", `"${escaped}"`);
  const encoded = encodeUtf16LeBase64(script);
  return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}

async function sendUrlToRunningNetease(url, deps) {
  const command = buildUrlForwardScript(url);
  const result = await runPowerShell(command, deps);
  const count = parseInt((result.stdout || "").trim(), 10);
  return {
    found: Number.isFinite(count) && count > 0,
    sent: Number.isFinite(count) && count > 0,
    windowCount: Number.isFinite(count) ? count : 0,
  };
}

function buildMinimizeNeteaseScript() {
  return MINIMIZE_NETEASE_SCRIPT;
}

async function minimizeNeteaseWindows(deps) {
  const result = await runPowerShell(buildMinimizeNeteaseScript(), deps);
  const count = parseInt((result.stdout || "").trim(), 10);
  return {
    success: Number.isFinite(count),
    windowCount: Number.isFinite(count) ? count : 0,
  };
}

async function clickNeteaseSongPagePlayButton({ waitMs = 1800, ...deps } = {}) {
  const result = await runPowerShell(buildNeteaseSongPagePlayScript(waitMs), deps);
  const mode = (result.stdout || "").trim().split(/\s+/).pop() || "";
  if (mode === "uia") {
    return { success: true, method: "client-uia" };
  }
  if (mode === "coordinate") {
    return { success: true, method: "client-coordinate" };
  }
  return { success: false, error: mode || "client-play-click-failed" };
}

module.exports = {
  VK_CODES,
  APP_COMMANDS,
  NETEASE_CLASS_NAMES,
  POWERSHELL_SCRIPT,
  URL_FORWARD_SCRIPT_TEMPLATE,
  MINIMIZE_NETEASE_SCRIPT,
  buildKeybdScript,
  buildMinimizeNeteaseScript,
  buildNeteaseSongPagePlayScript,
  buildUrlForwardScript,
  clickNeteaseSongPagePlayButton,
  minimizeNeteaseWindows,
  runPowerShell,
  sendMediaKey,
  sendUrlToRunningNetease,
};
