import omnifocus from './assets/omnifocus.png';
import devonthink from './assets/devonthink.png';
import drafts from './assets/drafts.png';
import bear from './assets/bear.png';
import vscode from './assets/vscode.png';
import goland from './assets/goland.png';
import cursor from './assets/cursor.png';
import hookmark from './assets/hookmark.png';
import intellij_idea from './assets/intellij-idea.svg';
import pycharm from './assets/pycharm.svg';
import webstorm from './assets/webstorm.svg';
import phpstorm from './assets/phpstorm.svg';
import clion from './assets/clion.svg';
import rider from './assets/rider.svg';
import datagrip from './assets/datagrip.svg';
import rubymine from './assets/rubymine.svg';
import codex from './assets/codex.png';
import obsidian from './assets/obsidian.png';
import mindnode from './assets/mindnode.png';
import zed from './assets/zed.png';
import things from './assets/things.png';
import chatgpt from './assets/chatgpt.png';
import anybox from './assets/anybox.png';
import type { LinkTarget } from './links';
import { supportedApp, type SupportedApp } from './apps';

const icons: Record<SupportedApp, string> = { Codex: codex, ChatGPT: chatgpt, Anybox: anybox, Obsidian: obsidian, MindNode: mindnode, Zed: zed, Things: things,
  'OmniFocus': omnifocus,
  'DEVONthink': devonthink,
  'Drafts': drafts,
  'Bear': bear,
  'Visual Studio Code': vscode,
  'GoLand': goland,
  'Cursor': cursor,
  'Hookmark': hookmark,
  'IntelliJ IDEA': intellij_idea,
  'PyCharm': pycharm,
  'WebStorm': webstorm,
  'PhpStorm': phpstorm,
  'CLion': clion,
  'Rider': rider,
  'DataGrip': datagrip,
  'RubyMine': rubymine,
};

export function appIcon(target: LinkTarget): string | undefined {
  const app = supportedApp(target);
  return app ? icons[app] : undefined;
}
