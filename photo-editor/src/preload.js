const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openImage: () => ipcRenderer.invoke('dialog:openImage'),
  saveImage: (payload) => ipcRenderer.invoke('dialog:saveImage', payload),
  onMenu: (channel, callback) => {
    const valid = ['menu:open', 'menu:save', 'menu:save-as', 'menu:undo', 'menu:redo'];
    if (valid.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  }
});
