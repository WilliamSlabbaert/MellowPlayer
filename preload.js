const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  list:          ()                => ipcRenderer.invoke('vault:list'),
  pick:          ()                => ipcRenderer.invoke('vault:pick'),
  addFromPath:   p                 => ipcRenderer.invoke('vault:addFromPath', p),
  open:          id                => ipcRenderer.invoke('vault:open', id),
  setDuration:   (id, d)           => ipcRenderer.invoke('vault:setDuration', id, d),
  saveChapters:  (id, chapters)    => ipcRenderer.invoke('vault:saveChapters', id, chapters),
  remove:        id                => ipcRenderer.invoke('vault:delete', id),
  pickJson:      ()                => ipcRenderer.invoke('vault:pickJson'),
  // sync helper: drag-drop gives a File, we need its absolute path
  pathFor:       file              => webUtils.getPathForFile(file),
});
