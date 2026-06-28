import * as vscode from 'vscode';
import { EventType, ProgSnap2Writer } from './progsnap2';

interface PendingEdit {
  timestamp: Date;
  uri: string;
  relativePath: string;
  editType: 'Insert' | 'Delete' | 'Replace';
  insertText: string;
  deleteText: string;
  cursorLine: number;
  cursorColumn: number;
}

/**
 * Callbacks for toggling autocomplete from the extension
 */
export interface AutocompleteCallbacks {
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

/**
 * Tracks text document changes and groups them by pause intervals.
 */
export class EditTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private pendingEdits: PendingEdit[] = [];
  private shortPauseTimer: NodeJS.Timeout | undefined;
  private midPauseTimer: NodeJS.Timeout | undefined;
  private writer: ProgSnap2Writer;
  private subjectId: string;
  private assignmentId: string;
  private shortPauseMs: number;
  private midPauseMs: number;
  private isActive: boolean = false;
  private autocompleteEnabled: boolean = false;
  private autocompleteRecentlyUsed: boolean = false;
  private autocompleteRecentTimer: NodeJS.Timeout | undefined;
  private autocompleteCallbacks: AutocompleteCallbacks | undefined;
  private isTogglingAutocomplete: boolean = false;

  // Files to ignore for edit tracking (e.g., settings files changed by our extension)
  private static readonly IGNORED_PATHS = [
    '.vscode/settings.json',
    '.vscode\\settings.json',
  ];

  constructor(
    writer: ProgSnap2Writer,
    subjectId: string,
    assignmentId: string,
    shortPauseMs: number,
    midPauseMs: number,
    autocompleteCallbacks?: AutocompleteCallbacks,
  ) {
    this.writer = writer;
    this.subjectId = subjectId;
    this.assignmentId = assignmentId;
    this.shortPauseMs = shortPauseMs;
    this.midPauseMs = midPauseMs;
    this.autocompleteCallbacks = autocompleteCallbacks;
  }

  start(): void {
    if (this.isActive) { return; }
    this.isActive = true;

    // Listen to text document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChange(e))
    );

    // Listen to file open/close
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (this.isActive && doc.uri.scheme === 'file') {
          const relPath = this.getRelativePath(doc.uri);
          if (this.shouldIgnore(relPath)) { return; }
          this.writer.writeEvent({
            EventType: EventType.FileOpen,
            SubjectID: this.subjectId,
            AssignmentID: this.assignmentId,
            SourceLocation: relPath,
          });
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument(doc => {
        if (this.isActive && doc.uri.scheme === 'file') {
          const relPath = this.getRelativePath(doc.uri);
          if (this.shouldIgnore(relPath)) { return; }
          this.writer.writeEvent({
            EventType: EventType.FileClose,
            SubjectID: this.subjectId,
            AssignmentID: this.assignmentId,
            SourceLocation: relPath,
          });
        }
      })
    );

    // Listen to active editor change (file focus)
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (this.isActive && editor && editor.document.uri.scheme === 'file') {
          const relPath = this.getRelativePath(editor.document.uri);
          if (this.shouldIgnore(relPath)) { return; }
          this.writer.writeEvent({
            EventType: EventType.FileFocus,
            SubjectID: this.subjectId,
            AssignmentID: this.assignmentId,
            SourceLocation: relPath,
          });
        }
      })
    );
  }

  stop(): void {
    this.isActive = false;
    this.flushPendingEdits();
    this.clearTimers();
    if (this.autocompleteRecentTimer) {
      clearTimeout(this.autocompleteRecentTimer);
      this.autocompleteRecentTimer = undefined;
    }
    this.autocompleteRecentlyUsed = false;
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  private shouldIgnore(relativePath: string): boolean {
    return EditTracker.IGNORED_PATHS.some(p => relativePath.endsWith(p));
  }

  private async onDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
    if (!this.isActive) { return; }
    if (event.document.uri.scheme !== 'file') { return; }

    // Ignore changes triggered by our own autocomplete toggling
    if (this.isTogglingAutocomplete) { return; }

    const relativePath = this.getRelativePath(event.document.uri);

    // Ignore settings.json changes (caused by our autocomplete toggle)
    if (this.shouldIgnore(relativePath)) { return; }

    const now = Date.now();

    for (const change of event.contentChanges) {
      let editType: 'Insert' | 'Delete' | 'Replace';
      if (change.rangeLength === 0) {
        editType = 'Insert';
      } else if (change.text.length === 0) {
        editType = 'Delete';
      } else {
        editType = 'Replace';
      }

      const deleteText = change.rangeLength > 0
        ? `[${change.rangeLength} chars at L${change.range.start.line + 1}:${change.range.start.character}]`
        : '';

      const line = change.range.start.line + 1;
      const col = change.range.start.character + 1;

      // Check if this is just a newline + auto-indentation (e.g. "\n    ")
      const isAutoIndent = change.text.startsWith('\n') && change.text.trim() === '';

      // Detect multi-char insert (3+ chars in a single event = not normal typing)
      const isMultiCharInsert = editType === 'Insert' && change.text.length >= 3 && !isAutoIndent;

      if (isMultiCharInsert) {
        // Flush any pending normal edits first
        this.flushPendingEdits();

        // Determine if autocomplete or paste
        // autocompleteRecentlyUsed stays true for 2s after autocomplete is turned off
        // (because user types a char to trigger suggestion, which turns off autocomplete,
        //  then presses Tab to accept — all within ~2 seconds)
        const eventType = (this.autocompleteEnabled || this.autocompleteRecentlyUsed)
          ? EventType.AutocompleteAccept
          : EventType.Paste;

        this.writer.writeEvent({
          EventType: eventType,
          SubjectID: this.subjectId,
          AssignmentID: this.assignmentId,
          EditType: editType,
          InsertText: `[L${line}:${col}]${change.text}`.substring(0, 500),
          SourceLocation: relativePath,
          CursorLine: line,
          CursorColumn: col,
        });
      } else {
        this.pendingEdits.push({
          timestamp: new Date(),
          uri: event.document.uri.toString(),
          relativePath,
          editType,
          insertText: change.text,
          deleteText,
          cursorLine: line,
          cursorColumn: col,
        });
      }
    }

    // Reset timers
    this.clearTimers();

    // Short pause timer: group edits
    this.shortPauseTimer = setTimeout(() => {
      this.flushPendingEdits();
    }, this.shortPauseMs);

    // Mid pause timer: enable autocomplete (only if not already enabled)
    if (!this.autocompleteEnabled) {
      this.midPauseTimer = setTimeout(() => {
        this.onMidPause();
      }, this.midPauseMs);
    }

  }

  private flushPendingEdits(): void {
    if (this.pendingEdits.length === 0) { return; }

    const edits = [...this.pendingEdits];
    this.pendingEdits = [];

    // Group by file
    const byFile = new Map<string, PendingEdit[]>();
    for (const edit of edits) {
      const existing = byFile.get(edit.relativePath) || [];
      existing.push(edit);
      byFile.set(edit.relativePath, existing);
    }

    for (const [filePath, fileEdits] of byFile) {
      const firstInsert = fileEdits.find(e => e.insertText);
      const rawInsert = fileEdits
        .filter(e => e.insertText)
        .map(e => e.insertText)
        .join('');
      const insertTexts = firstInsert
        ? `[L${firstInsert.cursorLine}:${firstInsert.cursorColumn}]${rawInsert}`
        : '';
      const deleteTexts = fileEdits
        .filter(e => e.deleteText)
        .map(e => e.deleteText)
        .join('; ');

      const firstEdit = fileEdits[0];
      const lastEdit = fileEdits[fileEdits.length - 1];

      const hasInsert = fileEdits.some(e => e.editType === 'Insert' || e.editType === 'Replace');
      const hasDelete = fileEdits.some(e => e.editType === 'Delete' || e.editType === 'Replace');
      const editType = (hasInsert && hasDelete) ? 'Replace' : hasDelete ? 'Delete' : 'Insert';

      let codeStateId: string | undefined;
      try {
        const doc = vscode.workspace.textDocuments.find(d => this.getRelativePath(d.uri) === filePath);
        if (doc) {
          codeStateId = this.writer.saveCodeState(doc.getText(), filePath);
        }
      } catch {
        // Code state save is best-effort
      }

      this.writer.writeEvent({
        EventType: EventType.FileEdit,
        SubjectID: this.subjectId,
        AssignmentID: this.assignmentId,
        Timestamp: firstEdit.timestamp.toISOString(),
        EditType: editType,
        InsertText: insertTexts.substring(0, 500),
        DeleteText: deleteTexts.substring(0, 500),
        SourceLocation: filePath,
        CodeStateID: codeStateId,
        CursorLine: lastEdit.cursorLine,
        CursorColumn: lastEdit.cursorColumn,
        'X-EditCount': fileEdits.length,
      });
    }
  }

  /**
   * Called after mid pause (e.g. 10s) — enable autocomplete to help the user
   */
  private async onMidPause(): Promise<void> {
    if (this.autocompleteCallbacks && !this.autocompleteEnabled) {
      this.autocompleteEnabled = true;
      this.isTogglingAutocomplete = true;
      try {
        await this.autocompleteCallbacks.enable();
      } finally {
        this.isTogglingAutocomplete = false;
      }
      this.writer.writeEvent({
        EventType: EventType.AutocompleteOn,
        SubjectID: this.subjectId,
        AssignmentID: this.assignmentId,
      });
    }
  }


  private getRelativePath(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return uri.fsPath.replace(workspaceFolder.uri.fsPath, '').replace(/^[/\\]/, '');
    }
    return uri.fsPath;
  }

  private clearTimers(): void {
    if (this.shortPauseTimer) {
      clearTimeout(this.shortPauseTimer);
      this.shortPauseTimer = undefined;
    }
    if (this.midPauseTimer) {
      clearTimeout(this.midPauseTimer);
      this.midPauseTimer = undefined;
    }
  }

  updateSubjectId(id: string): void {
    this.subjectId = id;
  }

  updateAssignmentId(id: string): void {
    this.assignmentId = id;
  }

  /**
   * Reset autocomplete state so it can be re-enabled after mid pause
   * Called when completionProvider disables autocomplete due to mismatch
   */
  resetAutocompleteState(): void {
    this.autocompleteEnabled = false;
  }

  dispose(): void {
    this.stop();
  }
}
