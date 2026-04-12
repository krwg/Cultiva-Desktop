
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    title: 'Cultiva',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: false,
      sandbox: true
    },
    icon: path.join(__dirname, '../dist/favicon.ico'),
    backgroundColor: '#1c1c1e',
    show: false
  });

  // ============================================
  // 🔥 НАВИГАЦИЯ: Перехват открытия новых окон
  // ============================================
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Внешние ссылки (http/https) открываем в браузере
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    
    // Внутренние переходы разрешаем
    return { action: 'allow' };
  });

  // ============================================
  // 🔥 НАВИГАЦИЯ: Перехват will-navigate
  // ============================================
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      
      // Внешние ссылки открываем в браузере
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        event.preventDefault();
        shell.openExternal(navigationUrl);
        return;
      }
      
      // Для file:// протокола проверяем существование файла
      if (parsedUrl.protocol === 'file:') {
        const requestedPath = decodeURIComponent(parsedUrl.pathname);
        
        // Если файл существует, разрешаем навигацию
        if (fs.existsSync(requestedPath)) {
          return; // Всё ок, продолжаем
        }
        
        // Пробуем найти относительно dist
        const distPath = path.join(__dirname, '../dist');
        const relativePath = requestedPath.replace(/^.*[\\/]dist[\\/]?/, '');
        const alternativePath = path.join(distPath, relativePath);
        
        if (fs.existsSync(alternativePath)) {
          event.preventDefault();
          mainWindow.loadFile(alternativePath);
          return;
        }
        
        // Если файл не найден — показываем ошибку в консоли
        console.warn('[Electron] File not found:', requestedPath);
      }
    } catch (error) {
      console.error('[Electron] Navigation error:', error);
    }
  });

  // ============================================
  // 🔥 НАВИГАЦИЯ: Обработка внутренних редиректов
  // ============================================
  mainWindow.webContents.on('did-navigate', (event, url) => {
    console.log('[Electron] Navigated to:', url);
  });

  mainWindow.webContents.on('did-navigate-in-page', (event, url) => {
    console.log('[Electron] In-page navigation:', url);
  });

  // ============================================
  // Загрузка приложения
  // ============================================
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[Electron] Loading:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  // ============================================
  // Обработчики событий окна
  // ============================================
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc, validatedURL) => {
    console.error('[Electron] Failed to load:', errorCode, errorDesc);
    console.error('[Electron] URL:', validatedURL);
    
    // Показываем ошибку пользователю
    if (!isDev) {
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = \`
          <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#ff3b30;">
            <div style="text-align:center;">
              <h2>⚠️ Failed to load page</h2>
              <p>Error: \${errorDesc}</p>
              <button onclick="location.reload()" style="padding:10px 20px;margin-top:20px;cursor:pointer;">Reload</button>
            </div>
          </div>
        \`;
      `);
    }
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Electron] Render process gone:', details);
  });

  // ============================================
  // CSP для разрешения file:// навигации
  // ============================================
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' file: data:; " +
          "img-src 'self' data: blob: file:; " +
          "style-src 'self' 'unsafe-inline';"
        ]
      }
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================
// IPC Handlers
// ============================================

// Существующий handler для сохранения файлов
ipcMain.handle('save-file', async (event, data, fileName) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save backup',
    defaultPath: fileName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  
  if (filePath) {
    const { writeFile } = require('fs/promises');
    await writeFile(filePath, data);
    return { success: true, path: filePath };
  }
  return { success: false };
});

// 🔥 НОВОЕ: Навигация на определённую страницу
ipcMain.handle('navigate-to', (event, page) => {
  if (!mainWindow) return { success: false };
  
  const pagePath = path.join(__dirname, '../dist', page);
  console.log('[Electron] Navigating to:', pagePath);
  
  if (fs.existsSync(pagePath)) {
    mainWindow.loadFile(pagePath);
    return { success: true };
  }
  
  console.error('[Electron] Page not found:', pagePath);
  return { success: false, error: 'Page not found' };
});

// 🔥 НОВОЕ: Открыть календарь в отдельном окне (альтернативный метод)
ipcMain.on('open-calendar-window', () => {
  const calendarWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../dist/favicon.ico'),
  });
  
  const calendarPath = path.join(__dirname, '../dist/pages/calendar/index.html');
  if (fs.existsSync(calendarPath)) {
    calendarWindow.loadFile(calendarPath);
  } else {
    console.error('[Electron] Calendar page not found:', calendarPath);
    calendarWindow.close();
  }
});

// 🔥 НОВОЕ: Получить путь к dist (для отладки)
ipcMain.handle('get-app-path', () => {
  return {
    dist: path.join(__dirname, '../dist'),
    userData: app.getPath('userData'),
  };
});

// ============================================
// App Lifecycle
// ============================================
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});