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

        // Multi-char insert = Paste (AutocompleteAccept is logged by completionProvider)
        this.writer.writeEvent({
          EventType: EventType.Paste,
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

    // Mid pause timer: trigger autocomplete only if not already enabled
    if (!this.autocompleteEnabled) {
      console.log('[EDIT] Setting midPauseTimer (autocomplete currently disabled)');
      this.midPauseTimer = setTimeout(() => {
        this.onMidPause();
      }, this.midPauseMs);
    } else {
      console.log('[EDIT] Skipping midPauseTimer (autocomplete already enabled)');
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
      const firstEdit = fileEdits[0];
      const lastEdit = fileEdits[fileEdits.length - 1];

      const hasInsert = fileEdits.some(e => e.editType === 'Insert' || e.editType === 'Replace');
      const hasDelete = fileEdits.some(e => e.editType === 'Delete' || e.editType === 'Replace');

      let codeStateId: string | undefined;
      try {
        const doc = vscode.workspace.textDocuments.find(d => this.getRelativePath(d.uri) === filePath);
        if (doc) {
          codeStateId = this.writer.saveCodeState(doc.getText(), filePath);
        }
      } catch {
        // Code state save is best-effort
      }

      // If both Insert and Delete: log as separate events (Delete first, then Insert)
      if (hasInsert && hasDelete) {
        // Log Delete event
        const deleteTexts = fileEdits
          .filter(e => e.deleteText)
          .map(e => e.deleteText)
          .join('; ');

        this.writer.writeEvent({
          EventType: EventType.FileEdit,
          SubjectID: this.subjectId,
          AssignmentID: this.assignmentId,
          Timestamp: firstEdit.timestamp.toISOString(),
          EditType: 'Delete',
          InsertText: '',
          DeleteText: deleteTexts.substring(0, 500),
          SourceLocation: filePath,
          CodeStateID: undefined, // Don't save code state for Delete
          CursorLine: firstEdit.cursorLine,
          CursorColumn: firstEdit.cursorColumn,
          'X-EditCount': fileEdits.filter(e => e.deleteText).length,
        });

        // Log Insert event
        const firstInsert = fileEdits.find(e => e.insertText);
        const rawInsert = fileEdits
          .filter(e => e.insertText)
          .map(e => e.insertText)
          .join('');
        const insertTexts = firstInsert
          ? `[L${firstInsert.cursorLine}:${firstInsert.cursorColumn}]${rawInsert}`
          : '';

        this.writer.writeEvent({
          EventType: EventType.FileEdit,
          SubjectID: this.subjectId,
          AssignmentID: this.assignmentId,
          Timestamp: firstEdit.timestamp.toISOString(),
          EditType: 'Insert',
          InsertText: insertTexts.substring(0, 500),
          DeleteText: '',
          SourceLocation: filePath,
          CodeStateID: codeStateId, // Save code state after Insert
          CursorLine: lastEdit.cursorLine,
          CursorColumn: lastEdit.cursorColumn,
          'X-EditCount': fileEdits.filter(e => e.insertText).length,
        });
      } else if (hasDelete) {
        // Only Delete
        const deleteTexts = fileEdits
          .filter(e => e.deleteText)
          .map(e => e.deleteText)
          .join('; ');

        this.writer.writeEvent({
          EventType: EventType.FileEdit,
          SubjectID: this.subjectId,
          AssignmentID: this.assignmentId,
          Timestamp: firstEdit.timestamp.toISOString(),
          EditType: 'Delete',
          InsertText: '',
          DeleteText: deleteTexts.substring(0, 500),
          SourceLocation: filePath,
          CodeStateID: codeStateId,
          CursorLine: lastEdit.cursorLine,
          CursorColumn: lastEdit.cursorColumn,
          'X-EditCount': fileEdits.length,
        });
      } else {
        // Only Insert
        const firstInsert = fileEdits.find(e => e.insertText);
        const rawInsert = fileEdits
          .filter(e => e.insertText)
          .map(e => e.insertText)
          .join('');
        const insertTexts = firstInsert
          ? `[L${firstInsert.cursorLine}:${firstInsert.cursorColumn}]${rawInsert}`
          : '';

        this.writer.writeEvent({
          EventType: EventType.FileEdit,
          SubjectID: this.subjectId,
          AssignmentID: this.assignmentId,
          Timestamp: firstEdit.timestamp.toISOString(),
          EditType: 'Insert',
          InsertText: insertTexts.substring(0, 500),
          DeleteText: '',
          SourceLocation: filePath,
          CodeStateID: codeStateId,
          CursorLine: lastEdit.cursorLine,
          CursorColumn: lastEdit.cursorColumn,
          'X-EditCount': fileEdits.length,
        });
      }
    }
  }

  /**
   * Called after mid pause (e.g. 2s) — trigger autocomplete to provide new completion
   */
  private async onMidPause(): Promise<void> {
    // Don't enable autocomplete if no assignment is set
    if (!this.assignmentId || this.assignmentId === '-') {
      console.log('[EDIT] onMidPause - autocomplete blocked (no assignment set)');
      return;
    }

    console.log('[EDIT] onMidPause triggered - enabling autocomplete');
    if (this.autocompleteCallbacks) {
      this.autocompleteEnabled = true;

      this.isTogglingAutocomplete = true;
      try {
        await this.autocompleteCallbacks.enable();
      } finally {
        this.isTogglingAutocomplete = false;
      }

      // Log AutocompleteOn event
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
    console.log('[EDIT] resetAutocompleteState called - autocomplete will be re-enabled after mid pause');
    this.autocompleteEnabled = false;
  }

  /**
   * Start midPause timer immediately (e.g., when user presses ESC to dismiss ghost)
   * This treats the current moment as "typing stopped" and starts 2s countdown
   */
  startMidPauseTimer(): void {
    // Clear any existing timers
    this.clearTimers();

    // Don't start timer if no assignment is set
    if (!this.assignmentId || this.assignmentId === '-') {
      console.log('[EDIT] startMidPauseTimer - blocked (no assignment set)');
      return;
    }

    // Don't start timer if autocomplete is already enabled
    if (this.autocompleteEnabled) {
      console.log('[EDIT] startMidPauseTimer - skipped (autocomplete already enabled)');
      return;
    }

    console.log('[EDIT] startMidPauseTimer - setting midPauseTimer for 2s');
    this.midPauseTimer = setTimeout(() => {
      this.onMidPause();
    }, this.midPauseMs);
  }

  dispose(): void {
    this.stop();
  }
}
