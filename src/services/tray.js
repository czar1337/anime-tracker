'use strict';
// The tray icon (decision D1(a), v3 Phase 5): Open, Open data folder, Quit,
// without a runtime dependency. A hidden PowerShell child runs a WinForms
// NotifyIcon and writes one word per menu click to its stdout ("open",
// "folder", "quit"); this side acts on them. The child closes itself when this
// process is gone (it watches our pid), and is killed when we exit.
//
// Only in the packaged Windows app (the exe is the whole app there); never in
// development or tests, and ANIME_TRACKER_TEST_NO_TRAY=1 turns it off for the
// exe smoke test.

const { spawn } = require('node:child_process');
const { encodedCommand, POWERSHELL } = require('./toast.js');

const TRAY_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$icon = New-Object System.Windows.Forms.NotifyIcon
try { $icon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:AT_EXE) } catch { $icon.Icon = [System.Drawing.SystemIcons]::Application }
$icon.Text = $env:AT_TRAY_TITLE
$send = { param($word) [Console]::Out.WriteLine($word); [Console]::Out.Flush() }
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add($env:AT_TRAY_OPEN); $open.add_Click({ & $send 'open' })
$folder = $menu.Items.Add($env:AT_TRAY_FOLDER); $folder.add_Click({ & $send 'folder' })
$menu.Items.Add('-') | Out-Null
$quit = $menu.Items.Add($env:AT_TRAY_QUIT); $quit.add_Click({ & $send 'quit' })
$icon.ContextMenuStrip = $menu
$icon.add_MouseClick({ param($s, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { & $send 'open' } })
$icon.Visible = $true
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({ if (-not (Get-Process -Id ([int]$env:AT_PARENT) -ErrorAction SilentlyContinue)) { $icon.Visible = $false; [System.Windows.Forms.Application]::Exit() } })
$timer.Start()
[System.Windows.Forms.Application]::Run()
$icon.Dispose()
`;

// `labels` come from the copy registry; `on` maps a word to its action.
function startTray({ labels, on }) {
  if (process.platform !== 'win32' || process.env.ANIME_TRACKER_TEST_NO_TRAY === '1') return null;
  let child;
  try {
    child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-STA', '-EncodedCommand', encodedCommand(TRAY_SCRIPT)], {
      env: {
        ...process.env,
        AT_PARENT: String(process.pid),
        AT_EXE: process.execPath,
        AT_TRAY_TITLE: labels.title,
        AT_TRAY_OPEN: labels.open,
        AT_TRAY_FOLDER: labels.folder,
        AT_TRAY_QUIT: labels.quit,
      },
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch (err) {
    console.error(`[tray] Could not start the tray icon: ${err.message}`);
    return null;
  }
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const word = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (on[word]) on[word]();
    }
  });
  child.on('error', (err) => console.error(`[tray] ${err.message}`));
  const kill = () => {
    try {
      child.kill();
    } catch {
      // already gone
    }
  };
  process.on('exit', kill);
  return { stop: kill };
}

module.exports = { startTray };
