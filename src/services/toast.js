'use strict';
// Windows toast notifications without a runtime dependency (v3 Phase 5): one
// short-lived, hidden PowerShell process per notification, using the WinRT
// ToastNotificationManager (BurntToast is not installed by default).
//
// The text never touches the command line or the script: it travels in
// environment variables and goes into the toast XML through CreateTextNode,
// which escapes it. The script itself is passed as -EncodedCommand.
//
// The AppUserModelID is Windows PowerShell's own, which every Windows 10/11 has
// registered; an unregistered id would make Windows drop the toast silently.
//
// Test hook: ANIME_TRACKER_NOTIFY_LOG=<file> appends each notification to that
// file as a JSON line instead of showing it (any platform).

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// A toast process that has not finished by then is stopped.
const TOAST_TIMEOUT_MS = 20000;
// By full path, never a PATH lookup.
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const POWERSHELL_APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

const TOAST_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text></text><text></text></binding></visual></toast>')
$texts = $xml.GetElementsByTagName('text')
$texts.Item(0).AppendChild($xml.CreateTextNode($env:AT_TOAST_TITLE)) | Out-Null
$texts.Item(1).AppendChild($xml.CreateTextNode($env:AT_TOAST_BODY)) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:AT_TOAST_APP).Show($toast)
`;

function encodedCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

// Resolves true when the toast was handed to Windows (or logged), false when it
// could not be shown. Never throws.
function showToast({ title, body }) {
  const logFile = process.env.ANIME_TRACKER_NOTIFY_LOG;
  if (logFile) {
    try {
      fs.appendFileSync(logFile, `${JSON.stringify({ title, body, at: new Date().toISOString() })}\n`);
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encodedCommand(TOAST_SCRIPT)], {
        env: { ...process.env, AT_TOAST_TITLE: String(title || ''), AT_TOAST_BODY: String(body || ''), AT_TOAST_APP: POWERSHELL_APP_ID },
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already gone
      }
      resolve(false);
    }, TOAST_TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

module.exports = { showToast, encodedCommand, POWERSHELL };
