
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {

  navigateTo: (page) => ipcRenderer.invoke('navigate-to', page),
  openCalendarWindow: () => ipcRenderer.send('open-calendar-window'),
  

  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  

  saveFile: (data, fileName) => ipcRenderer.invoke('save-file', data, fileName),
  
  isElectron: true,
});