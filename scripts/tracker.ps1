# Ekran Zamanı - aktif pencere + boşta kalma izleyicisi
# Tek sefer başlar, döngüde her 'interval' saniyede bir JSON satırı yazar.
param([int]$Interval = 4, [int]$ParentPid = 0)
$ErrorActionPreference = 'SilentlyContinue'
$OutputEncoding = [System.Text.Encoding]::UTF8
# [Console]::Out varsayılan olarak OEM kod sayfasıyla yazar; Node tarafı UTF-8 bekliyor
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class UserActivity {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }
    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    public static double GetIdleSeconds() {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(lii);
        if (!GetLastInputInfo(ref lii)) return 0;
        uint idleMs = ((uint)Environment.TickCount) - lii.dwTime;
        return idleMs / 1000.0;
    }
    public static int GetForegroundPid() {
        IntPtr h = GetForegroundWindow();
        int pid = 0;
        GetWindowThreadProcessId(h, out pid);
        return pid;
    }

    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumProc callback, IntPtr lParam);

    // UWP uygulamalari ApplicationFrameHost penceresinin icinde calisir;
    // asil uygulama, baska bir surece ait ilk alt penceredir.
    public static int GetUwpChildPid(int hostPid) {
        IntPtr h = GetForegroundWindow();
        int found = 0;
        EnumChildWindows(h, delegate(IntPtr child, IntPtr l) {
            int p = 0;
            GetWindowThreadProcessId(child, out p);
            if (p != 0 && p != hostPid) { found = p; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@ | Out-Null

if ($Interval -lt 1) { $Interval = 1 }
while ($true) {
    # Ana uygulama (Electron) coktuyse veya zorla kapatildiysa arkada kalma
    if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
    try {
        $fgPid = [UserActivity]::GetForegroundPid()
        $idle  = [UserActivity]::GetIdleSeconds()
        $appName = "Unknown"
        if ($fgPid -gt 0) {
            $proc = Get-Process -Id $fgPid -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq 'ApplicationFrameHost') {
                $uwpPid = [UserActivity]::GetUwpChildPid($fgPid)
                if ($uwpPid -gt 0) {
                    $uwpProc = Get-Process -Id $uwpPid -ErrorAction SilentlyContinue
                    if ($uwpProc) { $proc = $uwpProc }
                }
            }
            if ($proc) {
                $appName = $proc.ProcessName
                try {
                    $desc = $proc.MainModule.FileVersionInfo.FileDescription
                    if ($desc -and $desc.Trim().Length -gt 0) { $appName = $desc.Trim() }
                } catch {}
            }
        }
        # Ondeki pencere bu uygulamanin kendisi mi? (arayuzde kendi adini gostermemek icin)
        $isSelf = ($ParentPid -gt 0 -and $fgPid -eq $ParentPid)
        $obj = [ordered]@{ app = $appName; idle = [math]::Round($idle, 1); self = $isSelf }
        [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
    } catch {
        [Console]::Out.WriteLine('{"app":"Unknown","idle":0}')
    }
    [Console]::Out.Flush()
    Start-Sleep -Seconds $interval
}
