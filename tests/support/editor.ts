import { StreamLanguage } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import fixture from '../fixtures/editor-tokens.json';

export type TokenCase = keyof typeof fixture.cases;
export const tokenCases = fixture.cases;

/**
 * Replays tokens recorded from Obsidian's editor (scripts/record-editor-tokens.mjs),
 * producing a syntax tree with the same node names and ranges. Line-class tokens
 * (`HyperMD-…`) overlap the tokens they decorate and are not needed by the plugin.
 */
function recordedLanguage(name: TokenCase): StreamLanguage<{ line: number }> {
  const { text, tokens } = fixture.cases[name];
  const lineStarts = [0];
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) lineStarts.push(index + 1);
  const replay = (tokens as Array<[number, number, string]>).filter(([, , token]) => !token.startsWith('HyperMD-'));
  const tokenTable = Object.fromEntries(replay.flatMap(([, , token]) => token.split('_')).map(part => [part, tags.content]));
  return StreamLanguage.define<{ line: number }>({
    name: 'obsidian-recorded',
    tokenTable,
    startState: () => ({ line: -1 }),
    copyState: state => ({ ...state }),
    blankLine: state => { state.line++; },
    token(stream, state) {
      if (stream.pos === 0) state.line++;
      const lineStart = lineStarts[state.line]!;
      const at = lineStart + stream.pos;
      const token = replay.find(([from]) => from === at);
      if (token) {
        stream.pos = token[1] - lineStart;
        return token[2].replace(/_/g, ' ');
      }
      const next = replay.find(([from]) => from > at && from < lineStart + stream.string.length);
      stream.pos = next ? next[0] - lineStart : stream.string.length;
      return null;
    },
  });
}

export function recordedState(name: TokenCase, extensions: Extension[] = []): EditorState {
  return EditorState.create({ doc: fixture.cases[name].text, extensions: [recordedLanguage(name), ...extensions] });
}

export function offsetOf(name: TokenCase, needle: string): number {
  const offset = fixture.cases[name].text.indexOf(needle);
  if (offset < 0) throw new Error(`Missing fixture text: ${needle}`);
  return offset;
}
