import type { LinkTarget } from './links';

export const SUPPORTED_APPS = [
  ['ChatGPT', 'chatgpt-conversation://preview'],
  ['Codex', 'codex://preview'],
  ['Zed', 'zed://preview'],
  ['MindNode', 'mindnode://preview'],
  ['Anybox', 'anybox://preview'],
  ['Obsidian', 'obsidian://preview'],
  ['Things', 'things://preview'],
  ['OmniFocus', 'omnifocus:///task/preview'],
  ['DEVONthink', 'x-devonthink-item://preview'],
  ['Drafts', 'drafts://open?uuid=preview'],
  ['Bear', 'bear://x-callback-url/open-note?id=preview'],
  ['Visual Studio Code', 'vscode://file/preview'],
  ['Cursor', 'cursor://anysphere.cursor-deeplink/prompt?text=preview'],
  ['Hookmark', 'hook://file/preview'],
  ['GoLand', 'jetbrains://goland/navigate/reference?project=preview&path=example.txt'],
  ['IntelliJ IDEA', 'jetbrains://idea/navigate/reference?project=preview&path=example.txt'],
  ['PyCharm', 'jetbrains://pycharm/navigate/reference?project=preview&path=example.txt'],
  ['WebStorm', 'jetbrains://web-storm/navigate/reference?project=preview&path=example.txt'],
  ['PhpStorm', 'jetbrains://php-storm/navigate/reference?project=preview&path=example.txt'],
  ['CLion', 'jetbrains://clion/navigate/reference?project=preview&path=example.txt'],
  ['Rider', 'jetbrains://rd/navigate/reference?project=preview&path=example.txt'],
  ['DataGrip', 'jetbrains://dbe/navigate/reference?project=preview&path=example.txt'],
  ['RubyMine', 'jetbrains://rubymine/navigate/reference?project=preview&path=example.txt'],
] as const;

export const FEATURED_APPS: readonly SupportedApp[] = ['ChatGPT', 'Codex', 'Zed', 'MindNode'];

export type SupportedApp = typeof SUPPORTED_APPS[number][0];

export function supportedApp(target: LinkTarget): SupportedApp | undefined {
  const name = target.kind === 'internal' ? 'Obsidian' : target.kind === 'app' ? target.app : undefined;
  return SUPPORTED_APPS.find(([app]) => app === name)?.[0];
}
