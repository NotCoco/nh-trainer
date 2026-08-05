const electron = require("electron");

electron.app.commandLine.appendSwitch("mute-audio");

const BaseBrowserWindow = electron.BrowserWindow;

class MutedBrowserWindow extends BaseBrowserWindow {
  constructor(options) {
    super(options);
    muteWindow(this);
  }
}

function muteWindow(window) {
  const { webContents } = window;
  webContents.setAudioMuted(true);
  webContents.on("did-start-loading", () => webContents.setAudioMuted(true));
  webContents.on("dom-ready", () => webContents.setAudioMuted(true));
}

module.exports = {
  ...electron,
  BrowserWindow: MutedBrowserWindow,
  muteWindow
};
