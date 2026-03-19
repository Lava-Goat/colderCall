const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const net = require('net');

// Use a fixed port so localStorage origin is stable across launches.
// Falls back to the next candidate if the preferred port is taken.
function findOpenPort(preferred = 59472) {
  return new Promise((resolve, reject) => {
    const attempt = (port) => {
      if (port > preferred + 10) { reject(new Error('No available port found near ' + preferred)); return; }
      const server = net.createServer();
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
      server.on('error', () => attempt(port + 1));
    };
    attempt(preferred);
  });
}

app.setName('colderCall');

let mainWindow;

function buildMenu() {
  const template = [
    {
      label: 'colderCall',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'Command+,',
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
              mainWindow.webContents.executeJavaScript(
                'document.getElementById("classroomField")?.scrollIntoView({behavior:"smooth",block:"center"})'
              );
            }
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'colderCall',
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  // Internal popout → new Electron window. External links → system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${port}`)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 760,
          title: 'colderCall',
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  try {
    process.env.DATA_DIR = path.join(app.getPath('userData'), 'data');

    const port = await findOpenPort();
    process.env.PORT = String(port);

    const { serverReady } = require('./server');
    await serverReady;

    buildMenu();
    createWindow(port);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
  } catch (err) {
    dialog.showErrorBox(
      'colderCall failed to start',
      err.stack || err.message || String(err)
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
