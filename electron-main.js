// Desktop shell for APEX CLASH: runs the game server inside the app and shows the game in its own window.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // sound without a first click (controller-only play)
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-background-timer-throttling');
if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
async function open() {
  const port = await require('./server.js').start(3000);
  win = new BrowserWindow({ width: 1366, height: 768, minWidth: 900, minHeight: 540, show: false, backgroundColor: '#07080d', title: 'APEX CLASH', autoHideMenuBar: true, icon: path.join(__dirname, 'public', 'assets', 'icon.png'), webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
  win.setMenu(null); win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, k) => { if (k.type === 'keyDown' && (k.key === 'F11' || (k.alt && k.key === 'Enter'))) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
  win.webContents.on('render-process-gone', () => setTimeout(() => { try { win.reload(); } catch (e) {} }, 500));
  win.loadURL('http://127.0.0.1:' + port + '/');
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(open).catch(e => { console.error(e); app.quit(); });
app.on('window-all-closed', () => app.quit());
