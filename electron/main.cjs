const { app, BrowserWindow, shell, Menu, Tray, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const APP_URL = 'https://livroto.vercel.app';
const APP_NAME = 'Livroto';

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 375,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'public', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    // Couleurs de la marque Livroto
    backgroundColor: '#f4f7f5',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Ouvre les liens externes dans le navigateur par défaut
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://wa.me') || url.startsWith('https://api.whatsapp.com')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (!url.startsWith(APP_URL) && !url.startsWith('https://joaepnfhhewadcklsquk.supabase.co')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'icon-192.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Ouvrir Livroto', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { label: 'Catalogue', click: () => mainWindow?.loadURL(`${APP_URL}/catalog`) },
    { label: 'Mes commandes', click: () => mainWindow?.loadURL(`${APP_URL}/orders`) },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]);

  tray.setToolTip(APP_NAME);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } });
}

function setupMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { label: `À propos de ${APP_NAME}`, click: () => mainWindow?.loadURL(`${APP_URL}/about`) },
        { type: 'separator' },
        { label: 'Quitter', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Navigation',
      submenu: [
        { label: 'Accueil', accelerator: 'CmdOrCtrl+H', click: () => mainWindow?.loadURL(APP_URL) },
        { label: 'Catalogue', accelerator: 'CmdOrCtrl+K', click: () => mainWindow?.loadURL(`${APP_URL}/catalog`) },
        { label: 'Panier', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.loadURL(`${APP_URL}/cart`) },
        { label: 'Mes commandes', click: () => mainWindow?.loadURL(`${APP_URL}/orders`) },
        { type: 'separator' },
        { label: 'Mon espace', click: () => mainWindow?.loadURL(`${APP_URL}/dashboard`) },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Recharger', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { label: 'Plein écran', accelerator: 'F11', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { type: 'separator' },
        { label: 'Zoom +', accelerator: 'CmdOrCtrl+=', click: () => { const z = mainWindow?.webContents.getZoomFactor(); mainWindow?.webContents.setZoomFactor((z ?? 1) + 0.1); } },
        { label: 'Zoom -', accelerator: 'CmdOrCtrl+-', click: () => { const z = mainWindow?.webContents.getZoomFactor(); mainWindow?.webContents.setZoomFactor(Math.max(0.5, (z ?? 1) - 0.1)); } },
        { label: 'Taille normale', accelerator: 'CmdOrCtrl+0', click: () => mainWindow?.webContents.setZoomFactor(1) },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupMenu();

  // Auto-updater (désactivé en dev)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Sécurité : empêche la navigation vers des URLs inconnues
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('https://joaepnfhhewadcklsquk.supabase.co')) {
      e.preventDefault();
    }
  });
});
