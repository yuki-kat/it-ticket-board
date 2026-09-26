const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const APP_PAGE = path.join(__dirname, 'app', 'index.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'IT Ticket Board',
    backgroundColor: '#f5f6f4',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Links that open a new window (e.g. mailto: or web links) go to the system's default apps.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep the window on the ticket board; send any other navigation to the default browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  });

  win.loadFile(APP_PAGE);
}

// Only one copy of the app at a time, so two windows don't overwrite each other's saved tickets.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
