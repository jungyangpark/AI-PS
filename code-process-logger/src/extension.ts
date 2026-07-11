import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { ProgSnap2Writer, EventType } from './progsnap2';
import { EditTracker } from './editTracker';
import { LLMCompletionProvider } from './completionProvider';
import { LogUploader } from './logUploader';
import { ChatbotPanel } from './chatbotPanel';

let writer: ProgSnap2Writer | undefined;
let editTracker: EditTracker | undefined;
let statusBarItem: vscode.StatusBarItem;
let submitButton: vscode.StatusBarItem;
let isSessionActive = false;
let completionProvider: LLMCompletionProvider | undefined;
let logUploader: LogUploader | undefined;
let currentSubjectId: string = '';
let currentAssignmentId: string = '';
let currentSessionId: string = '';

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

  // Submit button (hidden by default)
  submitButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  submitButton.command = 'codeProcessLogger.submitCode';
  submitButton.text = '$(cloud-upload) Submit Code';
  submitButton.tooltip = 'Submit your code for analysis';
  submitButton.hide();
  context.subscriptions.push(submitButton);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('codeProcessLogger.startSession', () => startSession(context)),
    vscode.commands.registerCommand('codeProcessLogger.stopSession', () => stopSession()),
    vscode.commands.registerCommand('codeProcessLogger.setSubjectId', () => setSubjectId(context)),
    vscode.commands.registerCommand('codeProcessLogger.setAssignmentId', () => setAssignmentId(context)),
    vscode.commands.registerCommand('codeProcessLogger.toggleAutocomplete', () => toggleAutocomplete()),
    vscode.commands.registerCommand('codeProcessLogger.insertCompletion', () => insertCompletion()),
    vscode.commands.registerCommand('codeProcessLogger.handleTab', () => handleTab()),
    vscode.commands.registerCommand('codeProcessLogger.openChatbot', () => ChatbotPanel.createOrShow(context.extensionUri)),
    vscode.commands.registerCommand('codeProcessLogger.submitCode', () => submitCode()),
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

  const config = vscode.workspace.getConfiguration('codeProcessLogger');
  const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';

  // Login: ask for Student ID
  const subjectId = await vscode.window.showInputBox({
    prompt: '학생 ID를 입력하세요 (Enter your Student ID)',
    placeHolder: 'e.g., student_01',
    ignoreFocusOut: true,
  });
  if (!subjectId) {
    vscode.window.showWarningMessage('Student ID is required.');
    return;
  }

  // Ask for password
  const password = await vscode.window.showInputBox({
    prompt: '비밀번호를 입력하세요 (Enter your password)',
    placeHolder: '처음이면 새 비밀번호 설정, 아니면 기존 비밀번호 입력',
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) {
    vscode.window.showWarningMessage('Password is required.');
    return;
  }

  // Determine level based on student ID
  let studentLevel: number;
  if (subjectId.includes('lv1')) {
    studentLevel = 1;
  } else if (subjectId.includes('lv2')) {
    studentLevel = 2;
  } else if (subjectId.includes('lv3')) {
    studentLevel = 3;
  } else {
    studentLevel = 1; // default
  }
  currentLevel = studentLevel;

  // Login to server
  try {
    const loginResult = await serverRequest(serverUrl, '/api/students/login', { studentId: subjectId, password });
    // studentLevel = loginResult.level;
    // currentLevel = studentLevel;
    await context.globalState.update('lastSubjectId', subjectId);
    // if (loginResult.status === 'password_set') {
    //   vscode.window.showInformationMessage('비밀번호가 설정되었습니다! (Password set successfully)');
    // }
  } catch (error: any) {
    vscode.window.showErrorMessage(`로그인 실패: ${error.message}`);
    return;
  }

  // Ask for Assignment ID
  const assignmentId = await vscode.window.showInputBox({
    prompt: '과제 ID를 입력하세요 (Enter Assignment ID)',
    placeHolder: 'e.g., assignment_01',
    ignoreFocusOut: true,
  }) || 'default';

  const sessionId = `${subjectId}_${assignmentId}_${formatDate(new Date())}`;

  // Save session info for submit functionality
  currentSubjectId = subjectId;
  currentAssignmentId = assignmentId;
  currentSessionId = sessionId;
  submitButton.show();

  // Initialize uploader (server only, no local files)
  const shortPauseMs = config.get<number>('shortPauseThreshold') || 1000;
  const midPauseMs = config.get<number>('midPauseThreshold') || 10000;

  logUploader = new LogUploader(serverUrl, subjectId, assignmentId, sessionId);

  // Create a dummy temporary directory for ProgSnap2Writer (required but not used)
  const tempDir = path.join(require('os').tmpdir(), 'code-process-logs-temp', sessionId);
  writer = new ProgSnap2Writer(
    tempDir,
    (event) => { if (logUploader) { logUploader.addEvent(event); } },
    (codeStateId, fileName, content) => { if (logUploader) { logUploader.uploadCodeState(codeStateId, fileName, content); } },
  );

  // Initialize LLM completion provider with student's level
  completionProvider = new LLMCompletionProvider(serverUrl);
  completionProvider.setSubjectId(subjectId);
  completionProvider.setLevel(studentLevel);
  completionProvider.setEnabled(false);
  completionProvider.registerTabHandler();
  completionProvider.startListening();

  // Register as InlineCompletionItemProvider
  const inlineProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    completionProvider
  );
  context.subscriptions.push(inlineProviderDisposable);

  editTracker = new EditTracker(writer, subjectId, assignmentId, shortPauseMs, midPauseMs, {
    enable: async () => {
      if (completionProvider && !completionProvider.isEnabled()) {
        completionProvider.setEnabled(true);
        completionProvider.triggerCompletion(false); // false = autocomplete mode
        updateStatusBar(true, true, 'autocomplete');
      }
      // vscode.window.showInformationMessage('자동완성이 켜졌습니다! (Autocomplete enabled)');
    },
    disable: async () => {
      if (completionProvider) {
        completionProvider.setEnabled(false);
        // Level 1: keep ghost visible (user is typing along)
        // Level 2 & 3: ghost already handled by completionProvider's own listener
      }
      updateStatusBar(true, false);
    },
  });

  // Set callback after editTracker is initialized so we can sync state
  completionProvider.setOnDisableCallback(() => {
    updateStatusBar(true, false);
    // Reset editTracker state so autocomplete can be re-enabled after mid pause
    if (editTracker) {
      editTracker.resetAutocompleteState();
    }
  });

  // Disable all external autocomplete (Cursor, Copilot, IntelliSense)
  await disableExternalAutocomplete();

  // Verify settings
  const editorConfig = vscode.workspace.getConfiguration('editor');
  const inlineSuggestEnabled = editorConfig.get<boolean>('inlineSuggest.enabled');
  console.log('After config update - inlineSuggest.enabled:', inlineSuggestEnabled);

  // Log session start
  writer.writeEvent({
    EventType: EventType.SessionStart,
    SubjectID: subjectId,
    AssignmentID: assignmentId,
  });

  editTracker.start();
  isSessionActive = true;
  vscode.commands.executeCommand('setContext', 'codeProcessLogger.sessionActive', true);
  updateStatusBar(true);

  // vscode.window.showInformationMessage(
  //   `Code logging started! Subject: ${subjectId}, Assignment: ${assignmentId}`
  // );
}

async function submitCode(): Promise<void> {
  if (!isSessionActive) {
    vscode.window.showWarningMessage('세션이 활성화되지 않았습니다. (No active session)');
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('열려있는 파일이 없습니다. (No file open)');
    return;
  }

  const code = editor.document.getText();
  const fileName = path.basename(editor.document.fileName);
  const config = vscode.workspace.getConfiguration('codeProcessLogger');
  const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';

  try {
    vscode.window.showInformationMessage('코드 제출 중... (Submitting code...)');

    const response = await serverRequest(serverUrl, '/api/submit', {
      studentId: currentSubjectId,
      assignmentId: currentAssignmentId,
      sessionId: currentSessionId,
      code,
      fileName
    });

    if (response.success) {
      const analysis = response.analysis;
      vscode.window.showInformationMessage(
        `✅ 코드 제출 완료! Blocks: ${analysis.totalBlocks}, KCs: ${analysis.kcs.join(', ')}, Complexity: ${analysis.complexity}`
      );
    } else {
      vscode.window.showErrorMessage('코드 제출에 실패했습니다. (Submit failed)');
    }
  } catch (error: any) {
    console.error('Submit error:', error);
    vscode.window.showErrorMessage(`코드 제출 실패: ${error.message} (Submit failed: ${error.message})`);
  }
}

async function handleTab(): Promise<void> {
  if (!isSessionActive || !completionProvider) {
    // No active session, execute default Tab behavior
    await vscode.commands.executeCommand('tab');
    return;
  }

  const hasCompletion = completionProvider.getOriginalCompletion() !== null;
  if (!hasCompletion) {
    // No completion available, execute default Tab behavior
    await vscode.commands.executeCommand('tab');
    return;
  }

  // We have a completion - handle based on level
  await completionProvider.handleTabPress();
}

async function toggleAutocomplete(): Promise<void> {
  if (!isSessionActive || !completionProvider) {
    return;
  }

  const isEnabled = completionProvider.isEnabled();

  if (isEnabled) {
    // Turn OFF: disable and clear ghost
    completionProvider.setEnabled(false);
    await completionProvider.clearGhost();
    updateStatusBar(true, false);
    vscode.window.showInformationMessage('자동완성이 꺼졌습니다 (Autocomplete disabled)');
  } else {
    // Turn ON: enable and trigger completion
    completionProvider.setEnabled(true);
    await completionProvider.triggerCompletion(false); // false = autocomplete mode
    updateStatusBar(true, true, 'autocomplete');
    // vscode.window.showInformationMessage('자동완성이 켜졌습니다! (Autocomplete enabled)');
  }
}


async function insertCompletion(): Promise<void> {
  if (!completionProvider) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const completion = completionProvider.getOriginalCompletion();
  if (!completion) {
    vscode.window.showWarningMessage('No completion available');
    return;
  }

  const position = editor.selection.active;
  await editor.edit(editBuilder => {
    editBuilder.insert(position, completion);
  });

  // Clear completion after insert
  await completionProvider.clearGhost();
  vscode.window.showInformationMessage('✅ Code inserted!');
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
  if (completionProvider) {
    completionProvider.dispose();
    completionProvider = undefined;
  }

  // Flush and clean up log uploader
  if (logUploader) {
    await logUploader.dispose();
    logUploader = undefined;
  }

  // // Randomly change student level for next session
  // const subjectId = editTracker['subjectId'];
  // const newLevel = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
  // const config = vscode.workspace.getConfiguration('codeProcessLogger');
  // const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';
  // try {
  //   await serverRequestPut(serverUrl, `/api/students/${subjectId}/level`, { level: newLevel });
  // } catch { /* best effort */ }

  editTracker.dispose();
  editTracker = undefined;
  writer = undefined;
  isSessionActive = false;
  vscode.commands.executeCommand('setContext', 'codeProcessLogger.sessionActive', false);
  updateStatusBar(false);

  // Hide submit button and clear session info
  submitButton.hide();
  currentSubjectId = '';
  currentAssignmentId = '';
  currentSessionId = '';

  // vscode.window.showInformationMessage(`Code logging stopped. Logs saved to: ${outputDir}`);
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
  if (newId === undefined || newId === current) { return; }

  await context.globalState.update('assignmentId', newId);

  if (!isSessionActive || !editTracker) {
    vscode.window.showInformationMessage(`Assignment ID set to: ${newId}`);
    return;
  }

  // Simply update assignment ID without changing level or creating new session
  editTracker.updateAssignmentId(newId);
  vscode.window.showInformationMessage(`Assignment ID updated to: ${newId}`);
}

let currentLevel: number = 0;

function updateStatusBar(active: boolean, autocompleteOn?: boolean, mode?: 'question' | 'autocomplete'): void {
  const levelTag = currentLevel ? ` [Lv${currentLevel}]` : '';
  if (active && autocompleteOn) {
    const modeText = mode === 'question' ? 'Question Mode' : 'Autocomplete ON';
    const icon = mode === 'question' ? '$(question)' : '$(lightbulb)';
    statusBarItem.text = `${icon} AI-PS: ${modeText}${levelTag}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    statusBarItem.command = 'codeProcessLogger.stopSession';
    statusBarItem.tooltip = mode === 'question'
      ? 'Question mode active — press Tab to accept answer'
      : 'Autocomplete is enabled — type to disable it again';
  } else if (active) {
    statusBarItem.text = `$(record) AI-PS: Recording${levelTag}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.command = 'codeProcessLogger.stopSession';
    statusBarItem.tooltip = 'Click to stop logging';
  } else {
    statusBarItem.text = '$(circle-outline) AI-PS: Idle';
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

  // Enable inline suggestions for our provider (but Copilot/Cursor are disabled by other settings)
  await editorConfig.update('inlineSuggest.enabled', true, vscode.ConfigurationTarget.Workspace);

  // Disable auto-closing brackets and quotes (interferes with level 1 follow-along)
  await editorConfig.update('autoClosingBrackets', 'never', vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('autoClosingQuotes', 'never', vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('autoSurround', 'never', vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('autoIndent', 'none', vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('formatOnType', false, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('formatOnPaste', false, vscode.ConfigurationTarget.Workspace);

  // Disable Python-specific auto-indent
  const pythonConfig = vscode.workspace.getConfiguration('python');
  await pythonConfig.update('analysis.autoIndent', false, vscode.ConfigurationTarget.Workspace);

  // Disable Cursor AI completions
  try {
    // Disable Cursor's main autocomplete feature
    const cursorConfig = vscode.workspace.getConfiguration('cursor');
    await cursorConfig.update('aiEnabled', false, vscode.ConfigurationTarget.Workspace);
    await cursorConfig.update('codeActions', false, vscode.ConfigurationTarget.Workspace);

    // Disable Cursor Tab completions
    const cursorCppConfig = vscode.workspace.getConfiguration('cursor.cpp');
    await cursorCppConfig.update('disabledLanguages', ['python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'go', 'rust', 'html', 'css', 'json', 'markdown', 'plaintext'], vscode.ConfigurationTarget.Workspace);
  } catch { /* Cursor not installed */ }

  // Disable GitHub Copilot
  try {
    const copilotConfig = vscode.workspace.getConfiguration('github.copilot');
    await copilotConfig.update('enable', { '*': false }, vscode.ConfigurationTarget.Workspace);
  } catch { /* Copilot not installed */ }

  // Disable all inline completion providers except ours
  await editorConfig.update('inlineSuggest.suppressSuggestions', false, vscode.ConfigurationTarget.Workspace);
}

async function restoreExternalAutocomplete(): Promise<void> {
  const editorConfig = vscode.workspace.getConfiguration('editor');

  await editorConfig.update('quickSuggestions', originalQuickSuggestions, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('suggestOnTriggerCharacters', originalSuggestOnTriggerCharacters, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('wordBasedSuggestions', originalWordBasedSuggestions, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('acceptSuggestionOnCommitCharacter', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('parameterHints.enabled', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('inlineSuggest.enabled', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('autoClosingBrackets', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('autoClosingQuotes', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('autoSurround', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('autoIndent', undefined, vscode.ConfigurationTarget.Workspace);
  await editorConfig.update('formatOnType', undefined, vscode.ConfigurationTarget.Workspace);

  try {
    const cursorCppConfig = vscode.workspace.getConfiguration('cursor.cpp');
    await cursorCppConfig.update('disabledLanguages', undefined, vscode.ConfigurationTarget.Workspace);
  } catch { /* Cursor not installed */ }
}

function serverRequestPut(serverUrl: string, apiPath: string, body: any): Promise<any> {
  return serverRequest(serverUrl, apiPath, body, 'PUT');
}

function serverRequest(serverUrl: string, apiPath: string, body: any, method: string = 'POST'): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(`${serverUrl}${apiPath}`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 10000,
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(json.error || `Server returned ${res.statusCode}`));
            }
          } catch {
            reject(new Error('Invalid server response'));
          }
        });
      },
    );

    req.on('error', (e) => reject(new Error(`Connection failed: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    req.write(data);
    req.end();
  });
}

function formatDate(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').substring(0, 19);
}

export function deactivate() {
  if (isSessionActive) {
    stopSession();
  }
}
