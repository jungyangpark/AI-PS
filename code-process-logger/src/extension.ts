import * as vscode from 'vscode';
import * as path from 'path';
import { ProgSnap2Writer, EventType } from './progsnap2';
import { EditTracker } from './editTracker';
import { LLMCompletionProvider } from './completionProvider';
import { LogUploader } from './logUploader';

let writer: ProgSnap2Writer | undefined;
let editTracker: EditTracker | undefined;
let statusBarItem: vscode.StatusBarItem;
let isSessionActive = false;
let completionProvider: LLMCompletionProvider | undefined;
let completionDisposable: vscode.Disposable | undefined;
let logUploader: LogUploader | undefined;

// Store original settings to restore on session end
let originalQuickSuggestions: any;
let originalSuggestOnTriggerCharacters: boolean | undefined;
let originalWordBasedSuggestions: string | undefined;
let originalInlineSuggest: boolean | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'codeProcessLogger.startSession';
  updateStatusBar(false);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('codeProcessLogger.startSession', () => startSession(context)),
    vscode.commands.registerCommand('codeProcessLogger.stopSession', () => stopSession()),
    vscode.commands.registerCommand('codeProcessLogger.setSubjectId', () => setSubjectId(context)),
    vscode.commands.registerCommand('codeProcessLogger.setAssignmentId', () => setAssignmentId(context)),
  );

  // Auto-start if configured
  const config = vscode.workspace.getConfiguration('codeProcessLogger');
  if (config.get<boolean>('autoStart')) {
    startSession(context);
  }
}

async function startSession(context: vscode.ExtensionContext): Promise<void> {
  if (isSessionActive) {
    vscode.window.showInformationMessage('Session is already active. Stop it first.');
    return;
  }

  // Get or ask for Subject ID
  let subjectId = context.globalState.get<string>('subjectId');
  if (!subjectId) {
    subjectId = await vscode.window.showInputBox({
      prompt: '참여자 ID를 입력하세요 (Enter your Subject ID)',
      placeHolder: 'e.g., student_001',
      ignoreFocusOut: true,
    });
    if (!subjectId) {
      vscode.window.showWarningMessage('Subject ID is required to start logging.');
      return;
    }
    await context.globalState.update('subjectId', subjectId);
  }

  // Get or ask for Assignment ID
  let assignmentId = context.globalState.get<string>('assignmentId');
  if (!assignmentId) {
    assignmentId = await vscode.window.showInputBox({
      prompt: '과제 ID를 입력하세요 (Enter Assignment ID)',
      placeHolder: 'e.g., assignment_01',
      ignoreFocusOut: true,
    });
    if (!assignmentId) {
      assignmentId = 'default';
    }
    await context.globalState.update('assignmentId', assignmentId);
  }

  const config = vscode.workspace.getConfiguration('codeProcessLogger');
  const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';

  // Determine output directory (local fallback)
  let outputDir = config.get<string>('outputDir');
  if (!outputDir) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      outputDir = path.join(workspaceFolder.uri.fsPath, '.code-process-logs');
    } else {
      outputDir = path.join(require('os').homedir(), '.code-process-logs');
    }
  }

  const sessionId = `${subjectId}_${assignmentId}_${formatDate(new Date())}`;
  const sessionDir = path.join(outputDir, sessionId);

  // Initialize writer (local) and uploader (server)
  const shortPauseMs = config.get<number>('shortPauseThreshold') || 1000;
  const midPauseMs = config.get<number>('midPauseThreshold') || 10000;
  const longPauseMs = config.get<number>('longPauseThreshold') || 20000;

  logUploader = new LogUploader(serverUrl, subjectId, assignmentId, sessionId);
  writer = new ProgSnap2Writer(
    sessionDir,
    (event) => { if (logUploader) { logUploader.addEvent(event); } },
    (codeStateId, fileName, content) => { if (logUploader) { logUploader.uploadCodeState(codeStateId, fileName, content); } },
  );

  // Initialize LLM completion provider
  completionProvider = new LLMCompletionProvider(serverUrl);
  completionProvider.setSubjectId(subjectId);
  completionProvider.setEnabled(false); // Starts disabled

  // Register as inline completion provider
  completionDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    completionProvider,
  );

  editTracker = new EditTracker(writer, subjectId, assignmentId, shortPauseMs, midPauseMs, longPauseMs, {
    enable: async () => {
      if (completionProvider) { completionProvider.setEnabled(true); }
      updateStatusBar(true, true);
      vscode.window.showInformationMessage('자동완성이 켜졌습니다! (Autocomplete enabled)');
    },
    disable: async () => {
      if (completionProvider) { completionProvider.setEnabled(false); }
      updateStatusBar(true, false);
    },
  });

  // Disable all external autocomplete (Cursor, Copilot, IntelliSense)
  await disableExternalAutocomplete();

  // Log session start
  writer.writeEvent({
    EventType: EventType.SessionStart,
    SubjectID: subjectId,
    AssignmentID: assignmentId,
  });

  editTracker.start();
  isSessionActive = true;
  updateStatusBar(true);

  vscode.window.showInformationMessage(
    `Code logging started! Subject: ${subjectId}, Assignment: ${assignmentId}`
  );
}

async function stopSession(): Promise<void> {
  if (!isSessionActive || !writer || !editTracker) {
    vscode.window.showInformationMessage('No active session to stop.');
    return;
  }

  editTracker.stop();

  writer.writeEvent({
    EventType: EventType.SessionEnd,
    SubjectID: editTracker['subjectId'],
    AssignmentID: editTracker['assignmentId'],
  });

  const outputDir = writer.getOutputDir();

  // Restore external autocomplete settings
  await restoreExternalAutocomplete();

  // Clean up completion provider
  if (completionDisposable) {
    completionDisposable.dispose();
    completionDisposable = undefined;
  }
  completionProvider = undefined;

  // Flush and clean up log uploader
  if (logUploader) {
    await logUploader.dispose();
    logUploader = undefined;
  }

  editTracker.dispose();
  editTracker = undefined;
  writer = undefined;
  isSessionActive = false;
  updateStatusBar(false);

  vscode.window.showInformationMessage(`Code logging stopped. Logs saved to: ${outputDir}`);
}

async function setSubjectId(context: vscode.ExtensionContext): Promise<void> {
  const current = context.globalState.get<string>('subjectId') || '';
  const newId = await vscode.window.showInputBox({
    prompt: '참여자 ID를 입력하세요 (Enter your Subject ID)',
    value: current,
    ignoreFocusOut: true,
  });
  if (newId !== undefined) {
    await context.globalState.update('subjectId', newId);
    if (editTracker) { editTracker.updateSubjectId(newId); }
    if (completionProvider) { completionProvider.setSubjectId(newId); }
    vscode.window.showInformationMessage(`Subject ID set to: ${newId}`);
  }
}

async function setAssignmentId(context: vscode.ExtensionContext): Promise<void> {
  const current = context.globalState.get<string>('assignmentId') || '';
  const newId = await vscode.window.showInputBox({
    prompt: '과제 ID를 입력하세요 (Enter Assignment ID)',
    value: current,
    ignoreFocusOut: true,
  });
  if (newId !== undefined) {
    await context.globalState.update('assignmentId', newId);
    if (editTracker) { editTracker.updateAssignmentId(newId); }
    vscode.window.showInformationMessage(`Assignment ID set to: ${newId}`);
  }
}

function updateStatusBar(active: boolean, autocompleteOn?: boolean): void {
  if (active && autocompleteOn) {
    statusBarItem.text = '$(lightbulb) Code Logger: Autocomplete ON';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    statusBarItem.command = 'codeProcessLogger.stopSession';
    statusBarItem.tooltip = 'Autocomplete is enabled — type to disable it again';
  } else if (active) {
    statusBarItem.text = '$(record) Code Logger: Recording';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.command = 'codeProcessLogger.stopSession';
    statusBarItem.tooltip = 'Click to stop logging';
  } else {
    statusBarItem.text = '$(circle-outline) Code Logger: Idle';
    statusBarItem.backgroundColor = undefined;
    statusBarItem.command = 'codeProcessLogger.startSession';
    statusBarItem.tooltip = 'Click to start logging';
  }
}

async function disableExternalAutocomplete(): Promise<void> {
  const editorConfig = vscode.workspace.getConfiguration('editor');

  // Save original values
  originalQuickSuggestions = editorConfig.get('quickSuggestions');
  originalSuggestOnTriggerCharacters = editorConfig.get<boolean>('suggestOnTriggerCharacters');
  originalWordBasedSuggestions = editorConfig.get<string>('wordBasedSuggestions');
  originalInlineSuggest = editorConfig.get<boolean>('inlineSuggest.enabled');

  // Disable VS Code built-in autocomplete
  await editorConfig.update('quickSuggestions', { other: false, comments: false, strings: false }, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('suggestOnTriggerCharacters', false, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('wordBasedSuggestions', 'off', vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('acceptSuggestionOnCommitCharacter', false, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('parameterHints.enabled', false, vscode.ConfigurationTarget.Workspace);

  // Disable inline suggestions (Copilot, Cursor, etc.)
  await editorConfig.update('inlineSuggest.enabled', false, vscode.ConfigurationTarget.Workspace);

  // Disable Cursor Tab completions
  try {
    const cursorCppConfig = vscode.workspace.getConfiguration('cursor.cpp');
    await cursorCppConfig.update('disabledLanguages', ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'go', 'rust', 'html', 'css', 'json', 'markdown', 'plaintext'], vscode.ConfigurationTarget.Workspace);
  } catch { /* Cursor not installed */ }
}

async function restoreExternalAutocomplete(): Promise<void> {
  const editorConfig = vscode.workspace.getConfiguration('editor');

  await editorConfig.update('quickSuggestions', originalQuickSuggestions, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('suggestOnTriggerCharacters', originalSuggestOnTriggerCharacters, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('wordBasedSuggestions', originalWordBasedSuggestions, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('acceptSuggestionOnCommitCharacter', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('parameterHints.enabled', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('inlineSuggest.enabled', undefined, vscode.ConfigurationTarget.Workspace);

  try {
    const cursorCppConfig = vscode.workspace.getConfiguration('cursor.cpp');
    await cursorCppConfig.update('disabledLanguages', undefined, vscode.ConfigurationTarget.Workspace);
  } catch { /* Cursor not installed */ }
}

function formatDate(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').substring(0, 19);
}

export function deactivate() {
  if (isSessionActive) {
    stopSession();
  }
}
