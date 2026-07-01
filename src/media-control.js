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
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool SetForegroundWindow(IntPtr hWnd);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool AllowSetForegroundWindow(uint dwProcessId);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern IntPtr GetForegroundWindow();",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool BringWindowToTop(IntPtr hWnd);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);",
  "    [DllImport(\"user32.dll\")]",
  "    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);",
  "    [DllImport(\"kernel32.dll\")]",
  "    public static extern uint GetCurrentThreadId();",
  "    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);",
  "    public const uint WM_APPCOMMAND = 0x0319;",
  "    public const uint GA_ROOT = 2;",
  "    public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;",
  "    public const uint KEYEVENTF_KEYUP = 0x0002;",
  "    public const uint ASFW_ANY = 0x0000FFFF;",
  "    public const int SW_RESTORE = 9;",
  "    public const int SW_SHOW = 5;",
  "    public static readonly IntPtr HWND_TOP = new IntPtr(0);",
  "    public const uint SWP_NOMOVE = 0x0002;",
  "    public const uint SWP_NOSIZE = 0x0001;",
  "    public const uint SWP_SHOWWINDOW = 0x0040;",
  "    public const byte VK_SPACE = 0x20;",
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
  "    public static void ForceForeground(IntPtr hwnd) {",
  "      // AttachThreadInput trick: attach our thread to the foreground",
  "      // window's thread so SetForegroundWindow can bypass the focus-",
  "      // stealing prevention that PowerShell normally trips.",
  "      IntPtr fg = GetForegroundWindow();",
  "      uint ourThread = GetCurrentThreadId();",
  "      if (fg != IntPtr.Zero && fg != hwnd) {",
  "        uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);",
  "        if (fgThread != 0 && fgThread != ourThread) {",
  "          AttachThreadInput(ourThread, fgThread, true);",
  "        }",
  "      }",
  "      AllowSetForegroundWindow(ASFW_ANY);",
  "      ShowWindow(hwnd, SW_RESTORE);",
  "      SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);",
  "      SetForegroundWindow(hwnd);",
  "      BringWindowToTop(hwnd);",
  "      if (fg != IntPtr.Zero && fg != hwnd) {",
  "        uint fgThread = GetWindowThreadProcessId(fg, IntPtr.Zero);",
  "        if (fgThread != 0 && fgThread != ourThread) {",
  "          AttachThreadInput(ourThread, fgThread, false);",
  "        }",
  "      }",
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
  "        if (appCommand == 14) {",
  "          ForceForeground(windows[0]);",
  "          System.Threading.Thread.Sleep(150);",
  "          keybd_event(VK_SPACE, 0, 0, UIntPtr.Zero);",
  "          keybd_event(VK_SPACE, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);",
  "        }",
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
    if (child.stderr) {
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    }
    if (child.stdout) {
      child.stdout.on("data", () => {});
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ code, stderr });
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

module.exports = {
  VK_CODES,
  APP_COMMANDS,
  NETEASE_CLASS_NAMES,
  POWERSHELL_SCRIPT,
  buildKeybdScript,
  runPowerShell,
  sendMediaKey,
};
