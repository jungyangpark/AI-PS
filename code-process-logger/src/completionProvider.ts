import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

/**
 * InlineCompletionProvider-based completion - shows real ghost text
 */
export class LLMCompletionProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
  private serverUrl: string;
  private enabled: boolean = false;
  private subjectId: string = '';
  private level: number = 3;

  private cachedCompletion: string = '';
  private cachedPosition: vscode.Position | undefined;
  private isQuestionMode: boolean = false;
  private matchedChars: number = 0;

  private disposables: vscode.Disposable[] = [];
  private onDisableCallback: (() => void) | undefined;
  private decorationType: vscode.TextEditorDecorationType;
  private insertedNewlinesCount: number = 0; // Track how many temporary newlines we inserted

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;

    // Create decoration type for ghost text using 'after' contentText
    this.decorationType = vscode.window.createTextEditorDecorationType({});

    console.log('🔵 InlineCompletionProvider with decoration fallback initialized');
  }

  startListening(): void {
    this.logToFile('startListening', { inlineCompletionProvider: true });
    console.log('🔵 InlineCompletionProvider ready');
  }

  // InlineCompletionItemProvider interface implementation
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
    if (!this.enabled) {
      this.logToFile('provideInlineCompletionItems', { enabled: false });
      return undefined;
    }

    if (!this.cachedCompletion || !this.cachedPosition) {
      this.logToFile('provideInlineCompletionItems', { noCache: true });
      return undefined;
    }

    this.logToFile('provideInlineCompletionItems', {
      hasCache: true,
      cachedPos: `${this.cachedPosition.line}:${this.cachedPosition.character}`,
      currentPos: `${position.line}:${position.character}`,
      level: this.level,
      matchedChars: this.matchedChars,
      completionLength: this.cachedCompletion.length,
      first50: this.cachedCompletion.substring(0, 50)
    });

    // Use current cursor position to display ghost (ignore cached position validation)

    // Calculate how much to show based on level and matched characters
    let displayCompletion = this.cachedCompletion;

    if (this.level === 1 || this.level === 3) {
      // For Level 1 and 3: show remaining completion after matched chars
      displayCompletion = this.cachedCompletion.substring(this.matchedChars);
    }

    // Remove leading newlines to prevent ghost text from appearing on multiple lines below cursor
    // This happens when user presses Enter multiple times in blank lines
    displayCompletion = displayCompletion.replace(/^\n+/, '');

    if (displayCompletion.length > 0) {
      this.logToFile('provideInlineCompletionItems', {
        returning: true,
        displayLength: displayCompletion.length,
        displayFirst50: displayCompletion.substring(0, 50)
      });
      const item = new vscode.InlineCompletionItem(displayCompletion, new vscode.Range(position, position));
      return [item];
    }

    this.logToFile('provideInlineCompletionItems', { emptyDisplay: true });
    return undefined;
  }

  async triggerCompletion(questionMode: boolean = false): Promise<void> {
    this.logToFile('triggerCompletion', { started: true, questionMode });
    this.isQuestionMode = questionMode;

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.logToFile('triggerCompletion', { error: 'No active editor' });
      return;
    }

    const document = editor.document;
    const position = editor.selection.active;

    const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const suffix = document.getText(new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end));
    const language = document.languageId;
    const fileName = document.fileName.split('/').pop() || 'untitled';

    const cancellation = new vscode.CancellationTokenSource();

    try {
      const completion = await this.fetchCompletion(prefix, suffix, language, fileName, cancellation.token, questionMode);
      if (completion && completion.trim().length > 0) {
        // Remove leading newline if present
        const cleanedCompletion = completion.startsWith('\n') ? completion.substring(1) : completion;
        this.cachedCompletion = cleanedCompletion;
        this.cachedPosition = position;
        this.matchedChars = 0;

        this.logToFile('triggerCompletion', {
          completionReceived: true,
          completionLength: cleanedCompletion.length,
          position: `${position.line}:${position.character}`,
          first200: cleanedCompletion.substring(0, 200)
        });

        // Set context variable to enable Tab keybinding
        vscode.commands.executeCommand('setContext', 'codeProcessLogger.hasCompletion', true);

        // Use InlineCompletionProvider (native ghost text, cleaner)
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');

        this.logToFile('triggerCompletion', { ghostShown: true });
      } else {
        this.logToFile('triggerCompletion', { completionEmpty: true });
      }
    } catch (error) {
      this.logToFile('triggerCompletion', { error: String(error) });
    } finally {
      cancellation.dispose();
    }
  }

  private async showGhostTextDecoration(editor: vscode.TextEditor, position: vscode.Position, completion: string): Promise<void> {
    // Clear any existing decorations and temporary newlines
    await this.clearTemporaryNewlines(editor);
    editor.setDecorations(this.decorationType, []);

    const lines = completion.split('\n');
    const decorations: vscode.DecorationOptions[] = [];

    // Calculate how many extra lines we need to create
    const currentLineCount = editor.document.lineCount;
    const neededLines = position.line + lines.length;
    const linesToCreate = Math.max(0, neededLines - currentLineCount);

    // Insert temporary newlines at the end of the document if needed
    if (linesToCreate > 0) {
      const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
      const endPosition = lastLine.range.end;

      const newlines = '\n'.repeat(linesToCreate);
      await editor.edit(editBuilder => {
        editBuilder.insert(endPosition, newlines);
      }, { undoStopBefore: false, undoStopAfter: false });

      this.insertedNewlinesCount = linesToCreate;
    }

    // First line: show after cursor on the same line
    if (lines.length > 0 && lines[0].length > 0) {
      decorations.push({
        range: new vscode.Range(position, position),
        renderOptions: {
          after: {
            contentText: lines[0],
            color: new vscode.ThemeColor('editorGhostText.foreground'),
            fontStyle: 'italic',
          }
        }
      });
    }

    // Remaining lines: show at the beginning of each subsequent line
    for (let i = 1; i < lines.length; i++) {
      const lineNumber = position.line + i;
      const lineStartPos = new vscode.Position(lineNumber, 0);

      decorations.push({
        range: new vscode.Range(lineStartPos, lineStartPos),
        renderOptions: {
          before: {
            contentText: lines[i],
            color: new vscode.ThemeColor('editorGhostText.foreground'),
            fontStyle: 'italic',
          }
        }
      });
    }

    editor.setDecorations(this.decorationType, decorations);

    this.logToFile('showGhostTextDecoration', {
      position: `${position.line}:${position.character}`,
      totalLines: lines.length,
      decorationsCount: decorations.length,
      insertedNewlines: this.insertedNewlinesCount,
      first100: completion.substring(0, 100)
    });
  }

  private async clearTemporaryNewlines(editor: vscode.TextEditor): Promise<void> {
    if (this.insertedNewlinesCount > 0) {
      // Delete the temporary newlines from the end of the document
      const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
      const startDeletePos = new vscode.Position(editor.document.lineCount - this.insertedNewlinesCount, 0);
      const endDeletePos = lastLine.range.end;

      await editor.edit(editBuilder => {
        editBuilder.delete(new vscode.Range(startDeletePos, endDeletePos));
      }, { undoStopBefore: false, undoStopAfter: false });

      this.insertedNewlinesCount = 0;
    }
  }

  fetchCompletion(
    prefix: string,
    suffix: string,
    language: string,
    fileName: string,
    token: vscode.CancellationToken,
    questionMode: boolean = false,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        prefix: prefix.slice(-2000),  // 원래대로 복구
        suffix: suffix.slice(0, 500),  // 원래대로 복구
        language,
        fileName,
        subjectId: this.subjectId,
        questionMode,
      });

      const url = new URL(`${this.serverUrl}/api/complete`);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json.completion || null);
            } catch {
              resolve(null);
            }
          });
        },
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      token.onCancellationRequested(() => { req.destroy(); resolve(null); });

      req.write(body);
      req.end();
    });
  }

  // Public API
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.cachedCompletion = '';
    }
    this.logToFile('setEnabled', { enabled });
    console.log('🔵 Enabled:', enabled);
  }

  setSubjectId(subjectId: string): void {
    this.subjectId = subjectId;
  }

  setLevel(level: number): void {
    this.level = level;
  }

  getLevel(): number {
    return this.level;
  }

  setOnDisableCallback(callback: () => void): void {
    this.onDisableCallback = callback;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getIsQuestionMode(): boolean {
    return this.isQuestionMode;
  }

  getOriginalCompletion(): string | null {
    return this.cachedCompletion || null;
  }

  getMatchedChars(): number {
    return this.matchedChars;
  }

  async clearGhost(): Promise<void> {
    this.cachedCompletion = '';
    this.cachedPosition = undefined;
    this.matchedChars = 0;
    this.isQuestionMode = false;

    // Clear context variable
    vscode.commands.executeCommand('setContext', 'codeProcessLogger.hasCompletion', false);

    // Hide inline suggestion
    await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');

    this.logToFile('clearGhost', { cleared: true });
  }

  async handleTabPress(): Promise<void> {
    this.logToFile('handleTabPress', { level: this.level, hasCompletion: !!this.cachedCompletion });

    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.cachedCompletion) {
      return;
    }

    if (this.level === 1) {
      // Level 1: Tab does nothing special, just insert tab character
      await vscode.commands.executeCommand('tab');
    } else if (this.level === 2) {
      // Level 2: Tab does nothing special, just insert tab character
      await vscode.commands.executeCommand('tab');
    } else if (this.level === 3) {
      // Level 3: Tab accepts the completion via InlineCompletion
      const wasQuestionMode = this.isQuestionMode;

      this.logToFile('handleTabPress', {
        level: 3,
        matchedChars: this.matchedChars,
        totalLength: this.cachedCompletion.length,
        wasQuestionMode
      });

      // Accept the inline suggestion
      await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');

      // Clear cached data
      await this.clearGhost();

      // Always disable autocomplete after accepting completion
      this.enabled = false;
      if (this.onDisableCallback) {
        this.onDisableCallback();
      }

      this.logToFile('handleTabPress', { accepted: true, wasQuestionMode, disabled: true });
    }
  }

  registerTabHandler(): void {
    // Register keyboard handler for ghost text management (typing behavior)
    const typeDisposable = vscode.commands.registerCommand('type', async (args) => {
      const editor = vscode.window.activeTextEditor;

      this.logToFile('type', {
        text: args.text,
        enabled: this.enabled,
        hasCompletion: !!this.cachedCompletion,
        level: this.level
      });

      if (!this.enabled || !this.cachedCompletion || !editor) {
        // No ghost text showing, normal behavior
        return vscode.commands.executeCommand('default:type', args);
      }

      // Ghost text is showing
      const char = args.text;

      if (this.level === 1) {
        // Level 1: Match character by character
        return this.handleLevel1Type(editor, char);
      } else if (this.level === 2) {
        // Level 2: Always delete ghost text on any character input
        if (char === '\n' || char === '\r') {
          // Enter: keep ghost, just do normal newline
          return vscode.commands.executeCommand('default:type', args);
        } else if (char === '\t') {
          // Tab in level 2: just normal tab
          this.cachedCompletion = '';
          this.cachedPosition = undefined;
          this.matchedChars = 0;
          vscode.commands.executeCommand('setContext', 'codeProcessLogger.hasCompletion', false);
          return vscode.commands.executeCommand('default:type', args);
        } else {
          // Any other character: clear ghost, disable autocomplete, and type
          await this.clearGhost();
          this.enabled = false;
          if (this.onDisableCallback) {
            this.onDisableCallback();
          }
          return vscode.commands.executeCommand('default:type', args);
        }
      } else if (this.level === 3) {
        // Level 3: Match character by character (same as Level 1), but Tab accepts
        return this.handleLevel3Type(editor, char);
      }

      // Default: normal behavior
      return vscode.commands.executeCommand('default:type', args);
    });
    this.disposables.push(typeDisposable);

    console.log('🔵 Keyboard handlers registered for ghost text');
  }

  private async handleLevel1Type(editor: vscode.TextEditor, char: string): Promise<void> {
    // Level 1: Check if typed character matches the next character in completion
    const currentCompletion = this.cachedCompletion.substring(this.matchedChars);

    // For whitespace characters (enter, tab, space), check if they match and increment matchedChars
    if (char === '\n' || char === '\r' || char === '\t' || char === ' ') {
      // Type the character (may trigger auto-indent)
      await vscode.commands.executeCommand('default:type', { text: char });

      // For Enter key, only match the newline character itself
      // Auto-indent spaces will be handled separately
      if (char === '\n' || char === '\r') {
        if (currentCompletion.startsWith('\n')) {
          this.matchedChars += 1;
        } else if (currentCompletion.startsWith('\r\n')) {
          this.matchedChars += 2;
        }
      } else if (char === '\t' || char === ' ') {
        // Tab or space - only match if it actually matches the completion
        // Skip auto-indent spaces by checking if completion expects this whitespace
        if (currentCompletion.startsWith(char)) {
          this.matchedChars += char.length;
        }
        // If doesn't match, it's probably auto-indent, just skip it
      }

      this.cachedPosition = editor.selection.active;
      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
      this.logToFile('handleLevel1Type', { whitespace: true, char: char === '\n' ? 'newline' : (char === '\t' ? 'tab' : (char === ' ' ? 'space' : 'return')) });
      return;
    }

    // Skip leading whitespace in completion (auto-indent mismatch)
    const trimmedCompletion = currentCompletion.trimStart();
    const skippedWhitespace = currentCompletion.length - trimmedCompletion.length;

    if (trimmedCompletion.startsWith(char)) {
      // Match! Skip the leading whitespace and increment matched chars
      this.matchedChars += skippedWhitespace + char.length;
      await vscode.commands.executeCommand('default:type', { text: char });

      // If no more completion left, clear everything and disable autocomplete
      if (this.matchedChars >= this.cachedCompletion.length) {
        await this.clearGhost();
        this.enabled = false;
        if (this.onDisableCallback) {
          this.onDisableCallback();
        }
        this.logToFile('handleLevel1Type', { matched: true, completed: true, disabled: true });
      } else {
        // Update position and re-trigger inline suggestion
        this.cachedPosition = editor.selection.active;
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        this.logToFile('handleLevel1Type', { matched: true, remaining: this.cachedCompletion.length - this.matchedChars, skippedWhitespace });
      }
    } else {
      // Doesn't match: clear ghost text, disable autocomplete, and type normally
      await this.clearGhost();
      this.enabled = false;
      if (this.onDisableCallback) {
        this.onDisableCallback();
      }
      await vscode.commands.executeCommand('default:type', { text: char });
      this.logToFile('handleLevel1Type', { matched: false, cleared: true, disabled: true });
    }
  }

  private async handleLevel3Type(editor: vscode.TextEditor, char: string): Promise<void> {
    // Level 3: Similar to Level 1, but Tab is for accepting (handled by keybinding)
    const currentCompletion = this.cachedCompletion.substring(this.matchedChars);

    // For whitespace characters (enter, tab, space), check if they match and increment matchedChars
    if (char === '\n' || char === '\r' || char === '\t' || char === ' ') {
      // Type the character (may trigger auto-indent)
      await vscode.commands.executeCommand('default:type', { text: char });

      // For Enter key, only match the newline character itself
      // Auto-indent spaces will be handled separately
      if (char === '\n' || char === '\r') {
        if (currentCompletion.startsWith('\n')) {
          this.matchedChars += 1;
        } else if (currentCompletion.startsWith('\r\n')) {
          this.matchedChars += 2;
        }
      } else if (char === '\t' || char === ' ') {
        // Tab or space - only match if it actually matches the completion
        // Skip auto-indent spaces by checking if completion expects this whitespace
        if (currentCompletion.startsWith(char)) {
          this.matchedChars += char.length;
        }
        // If doesn't match, it's probably auto-indent, just skip it
      }

      this.cachedPosition = editor.selection.active;
      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
      this.logToFile('handleLevel3Type', { whitespace: true, char: char === '\n' ? 'newline' : (char === '\t' ? 'tab' : (char === ' ' ? 'space' : 'return')) });
      return;
    }

    // Skip leading whitespace in completion (auto-indent mismatch)
    const trimmedCompletion = currentCompletion.trimStart();
    const skippedWhitespace = currentCompletion.length - trimmedCompletion.length;

    if (trimmedCompletion.startsWith(char)) {
      // Match! Skip the leading whitespace and increment matched chars
      this.matchedChars += skippedWhitespace + char.length;
      await vscode.commands.executeCommand('default:type', { text: char });

      // If no more completion left, clear everything and disable autocomplete
      if (this.matchedChars >= this.cachedCompletion.length) {
        await this.clearGhost();
        this.enabled = false;
        if (this.onDisableCallback) {
          this.onDisableCallback();
        }
        this.logToFile('handleLevel3Type', { matched: true, completed: true, disabled: true });
      } else {
        // Update position and re-trigger inline suggestion
        this.cachedPosition = editor.selection.active;
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        this.logToFile('handleLevel3Type', { matched: true, remaining: this.cachedCompletion.length - this.matchedChars, skippedWhitespace });
      }
    } else {
      // Doesn't match: clear ghost text, disable autocomplete, and type normally
      await this.clearGhost();
      this.enabled = false;
      if (this.onDisableCallback) {
        this.onDisableCallback();
      }
      await vscode.commands.executeCommand('default:type', { text: char });
      this.logToFile('handleLevel3Type', { matched: false, cleared: true, disabled: true });
    }
  }

  dispose(): void {
    this.cachedCompletion = '';
    this.disposables.forEach(d => d.dispose());
  }

  private logToFile(event: string, data: any): void {
    // Send to server for logging
    if (!this.serverUrl) { return; }

    const body = JSON.stringify({ event, data });
    const url = new URL(`${this.serverUrl}/api/debug`);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 1000,
      },
      () => { /* Ignore response */ }
    );

    req.on('error', () => { /* Ignore errors */ });
    req.on('timeout', () => { req.destroy(); });
    req.write(body);
    req.end();
  }
}
