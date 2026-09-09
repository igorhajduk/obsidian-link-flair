// Run the locally installed Obsidian renderer against a disposable vault.
// The original app bundle and the user's vaults/profile are never modified.
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, 'work/obsidian-profile');
const vault = path.join(root, 'work/test-vault');
const bundle = process.env.LINK_FLAIR_OBSIDIAN_ASAR || '/Applications/Obsidian.app/Contents/Resources/obsidian.asar';
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(vault, { recursive: true });
electron.app.setPath('userData', profile);
electron.app.setName('Link Flair Test');
electron.app.getVersion = () => JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8')).version;
electron.app.commandLine.appendSwitch('remote-debugging-port', '19223');
electron.remote = require('@electron/remote/main');
electron.remote.initialize();
electron.protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true, corsEnabled: true } },
]);
fs.writeFileSync(path.join(profile, 'obsidian.json'), JSON.stringify({
  vaults: { linkflairtest: { path: vault, ts: Date.now(), open: true } },
  updateDisabled: true,
}));

// Obsidian's CLI socket otherwise uses the real home directory even with
// an isolated Electron profile. Redirect only that socket in memory.
const filename = path.join(bundle, 'main.js');
let source = fs.readFileSync(filename, 'utf8');
const socket = 'k.join(!W&&process.env.XDG_RUNTIME_DIR||de.homedir(),".obsidian-cli.sock")';
if (!source.includes(socket)) throw new Error('Installed Obsidian CLI socket changed; inspect before running.');
source = source.replace(socket, JSON.stringify(path.join(profile, 'cli.sock')));
const localModule = new Module(filename, module);
localModule.filename = filename;
localModule.paths = Module._nodeModulePaths(path.dirname(filename));
localModule._compile(source, filename);
localModule.exports(bundle, new EventEmitter());
