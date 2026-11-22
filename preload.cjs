const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('myNotes', {
  snapshot: () => ipcRenderer.invoke('notebook:snapshot'),
  mutate: (action, payload, digest) => ipcRenderer.invoke('notebook:mutate', action, payload, digest),
  openFloating: id => ipcRenderer.invoke('window:open-floating', id),
  showNoteMenu: id => ipcRenderer.invoke('window:note-menu', id),
  closeFloating: () => ipcRenderer.invoke('window:close-floating'),
  moveFloating: (dx, dy) => ipcRenderer.send('window:move-floating', dx, dy),
  collapseFloating: value => ipcRenderer.invoke('window:collapse-floating', value),
  syncNow: () => ipcRenderer.invoke('notebook:sync-now'),
  mainCommand: (command, noteID) => ipcRenderer.invoke('window:main-command', command, noteID),
  onUpdate: callback => { const handler = (_event, data) => callback(data); ipcRenderer.on('notebook:update', handler); return () => ipcRenderer.removeListener('notebook:update', handler); },
  onCommand: callback => { const handler = (_event, command) => callback(command); ipcRenderer.on('app:command', handler); return () => ipcRenderer.removeListener('app:command', handler); },
  onFloatingFocus: callback => { const handler = (_event, focused) => callback(focused); ipcRenderer.on('floating:focus', handler); return () => ipcRenderer.removeListener('floating:focus', handler); },
  onNoteAction: callback => { const handler = (_event, data) => callback(data); ipcRenderer.on('note:context-action', handler); return () => ipcRenderer.removeListener('note:context-action', handler); }
});
