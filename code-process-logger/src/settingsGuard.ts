import * as vscode from 'vscode';

/**
 * Applies the editor settings a session needs (no other autocomplete, no auto-indent, ...)
 * and restores exactly what was there before.
 *
 * - The value saved for restore is the one stored at the target scope (inspect()), not the
 *   effective value, so restoring never copies a workspace override into user settings.
 * - The saved values are persisted in globalState, so if VS Code crashes or is killed during a
 *   session, the next activation restores them (see restorePendingSettings).
 * - Settings that cannot be written (extension not installed) are skipped and not recorded.
 */

interface Override {
  section: string;
  key: string;
  value: unknown;
}

interface SavedSetting {
  section: string;
  key: string;
  value: unknown; // undefined = there was no value at this scope
}

interface SavedState {
  target: 'workspace' | 'global';
  workspaceId: string;
  settings: SavedSetting[];
}

const STATE_KEY_PREFIX = 'aips.savedSettings:';

const SESSION_OVERRIDES: Override[] = [
  // VS Code built-in suggestions
  { section: 'editor', key: 'quickSuggestions', value: { other: false, comments: false, strings: false } },
  { section: 'editor', key: 'suggestOnTriggerCharacters', value: false },
  { section: 'editor', key: 'wordBasedSuggestions', value: 'off' },
  { section: 'editor', key: 'acceptSuggestionOnCommitCharacter', value: false },
  { section: 'editor', key: 'parameterHints.enabled', value: false },
  // Our provider uses inline suggestions; hide their toolbar
  { section: 'editor', key: 'inlineSuggest.enabled', value: true },
  { section: 'editor', key: 'inlineSuggest.suppressSuggestions', value: false },
  { section: 'editor', key: 'inlineSuggest.showToolbar', value: 'never' },
  // Auto-closing / auto-indent / formatting interfere with Level 1 follow-along
  { section: 'editor', key: 'autoClosingBrackets', value: 'never' },
  { section: 'editor', key: 'autoClosingQuotes', value: 'never' },
  { section: 'editor', key: 'autoSurround', value: 'never' },
  { section: 'editor', key: 'autoIndent', value: 'none' },
  { section: 'editor', key: 'formatOnType', value: false },
  { section: 'editor', key: 'formatOnPaste', value: false },
  { section: 'editor', key: 'formatOnSave', value: false },
  { section: 'python', key: 'analysis.autoIndent', value: false },
  // Other AI assistants
  { section: 'cursor', key: 'aiEnabled', value: false },
  { section: 'cursor', key: 'codeActions', value: false },
  {
    section: 'cursor.cpp', key: 'disabledLanguages',
    value: ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'go', 'rust', 'html', 'css', 'json', 'markdown', 'plaintext'],
  },
  { section: 'github.copilot', key: 'enable', value: { '*': false } },
  { section: 'prettier', key: 'enable', value: false },
  { section: 'tabnine', key: 'experimentalAutoImports', value: false },
  { section: 'tabnine', key: 'disableLineRegex', value: true },
  { section: 'vsintellicode', key: 'modify.editor.suggestSelection', value: 'automaticallyOverrodeDefaultValue' },
  { section: 'aws', key: 'codeWhisperer.shareCodeWhispererContentWithAWS', value: false },
  { section: 'kite', key: 'showWelcomeNotificationOnStartup', value: false },
];

function currentWorkspaceId(): string {
  if (vscode.workspace.workspaceFile) { return vscode.workspace.workspaceFile.toString(); }
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.toString() : '';
}

/** One record per workspace (or one for user settings when no folder is open). */
function stateKey(): string {
  return STATE_KEY_PREFIX + (currentWorkspaceId() || 'global');
}

function scopeOf(target: SavedState['target']): vscode.ConfigurationTarget {
  return target === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
}

function valueAt(section: string, key: string, target: SavedState['target']): unknown {
  const info = vscode.workspace.getConfiguration(section).inspect(key);
  if (!info) { return undefined; }
  return target === 'workspace' ? info.workspaceValue : info.globalValue;
}

/** Apply the session settings. Never throws. */
export async function applySessionSettings(context: vscode.ExtensionContext): Promise<void> {
  // Leftovers from a session that did not end cleanly must be restored first; otherwise the
  // leftover session values would be recorded as the user's originals.
  if (context.globalState.get(stateKey())) {
    await restoreSessionSettings(context);
  }

  // Without an open folder there are no workspace settings, so the user settings are used
  // (and restored the same way).
  const target: SavedState['target'] = currentWorkspaceId() ? 'workspace' : 'global';
  const saved: SavedState = { target, workspaceId: currentWorkspaceId(), settings: [] };

  for (const o of SESSION_OVERRIDES) {
    const before = valueAt(o.section, o.key, target);
    try {
      await vscode.workspace.getConfiguration(o.section).update(o.key, o.value, scopeOf(target));
      saved.settings.push({ section: o.section, key: o.key, value: before });
      // Persist after every change so a crash mid-way still restores what was changed
      await context.globalState.update(stateKey(), saved);
    } catch {
      // Setting not registered (extension not installed): nothing to change or restore
    }
  }
}

/** Restore the settings saved by applySessionSettings. Never throws. */
export async function restoreSessionSettings(context: vscode.ExtensionContext): Promise<void> {
  const key = stateKey();
  const saved = context.globalState.get<SavedState>(key);
  if (!saved) { return; }

  for (const s of saved.settings) {
    try {
      await vscode.workspace.getConfiguration(s.section).update(s.key, s.value, scopeOf(saved.target));
    } catch {
      // Ignore: setting no longer writable
    }
  }
  await context.globalState.update(key, undefined);
}

/**
 * Called on activation: if a previous session did not end cleanly (crash, kill, reload),
 * put the user's settings back.
 */
export async function restorePendingSettings(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<SavedState>(stateKey())) {
    console.log('[AI-PS] Restoring settings left over from a session that did not end cleanly');
    await restoreSessionSettings(context);
  }
}
