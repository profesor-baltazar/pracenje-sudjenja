'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = ch => arg => ipcRenderer.invoke(ch, arg);
contextBridge.exposeInMainWorld('api', {
  state: call('app:state'),
  saveConfig: call('config:save'),
  register: call('auth:register'),
  resetPassword: call('auth:reset'),
  login: call('auth:login'),
  logout: call('auth:logout'),
  getData: call('data:get'),
  save: call('data:save'),
  remove: call('data:delete'),
  removeModule: call('data:deleteModule'),
  syncNow: call('sync:now'),
  resolve: call('conflict:resolve'),
  setOnline: call('net:online'),
  logs: call('log:get'),
  listUsers: call('users:list'),
  setUser: call('users:set'),
  removeUser: call('users:remove'),
  saveChoices: call('choices:save'),
  importPick: call('import:pick'),
  importRun: call('import:run'),
  exportXlsx: call('export:xlsx'),
  formsGet: call('forms:get'), formsSaveDraft: call('forms:saveDraft'), formsPublish: call('forms:publish'), formsDiscard: call('forms:discard'), tablesSave: call('tables:save'),
  backup: call('backup:export'),
  updateCheck: call('update:check'), updateInstall: call('update:install'),
  on: (ch, fn) => { const ok = ['sync:status', 'data:changed', 'app:state', 'update:available', 'update:progress']; if (ok.includes(ch)) ipcRenderer.on(ch, (_e, d) => fn(d)); },
});
