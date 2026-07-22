import * as fs from 'fs';
import * as path from 'path';

/**
 * ProgSnap2 Event Types
 */
export enum EventType {
  SessionStart = 'Session.Start',
  SessionEnd = 'Session.End',
  FileOpen = 'File.Open',
  FileClose = 'File.Close',
  FileCreate = 'File.Create',
  FileEdit = 'File.Edit',
  FileDelete = 'File.Delete',
  FileFocus = 'File.Focus',
  RunProgram = 'Run.Program',
  RunTest = 'Run.Test',
  CompileError = 'Compile.Error',
  CompileSuccess = 'Compile',
  // Custom events for productive struggle tracking
  PauseShort = 'X-Pause.Short',
  AutocompleteOn = 'X-Autocomplete.On',
  AutocompleteOff = 'X-Autocomplete.Off',
  AutocompleteFollow = 'X-Autocomplete.Follow',    // Level 1 & 3: Typed as recommended
  AutocompleteReject = 'X-Autocomplete.Reject',    // Level 1 & 3: Typed differently
  AutocompleteAccept = 'X-Autocomplete.Accept',    // Level 3: Tab pressed
  Paste = 'X-Paste',
  ChatbotQuestion = 'X-Chatbot.Question',
  ChatbotResponse = 'X-Chatbot.Response',
  SubmissionSuccess = 'X-Submission.Success',
  SubmissionSyntaxError = 'X-Submission.SyntaxError',
  SubmissionRuntimeError = 'X-Submission.RuntimeError',
  SubmissionWrongAnswer = 'X-Submission.WrongAnswer',
  SubmissionTimeLimitExceeded = 'X-Submission.TimeLimitExceeded',
  SubmissionWrongAlgorithm = 'X-Submission.WrongAlgorithm',
}


/**
 * A single ProgSnap2 event row
 */
export interface ProgSnap2Event {
  EventType: string;
  EventID: number;
  Order: number;
  SubjectID: string;
  AssignmentID: string;
  Timestamp: string;           // ISO 8601
  EditType?: string;           // Insert, Delete, Replace
  InsertText?: string;
  DeleteText?: string;
  SourceLocation?: string;     // file path relative to workspace
  CodeStateID?: string;
  CodeStateSection?: string;
  CursorLine?: number;
  CursorColumn?: number;
  // Custom fields for pause tracking
  'X-PauseDuration'?: number;  // milliseconds
  'X-PauseReason'?: string;
  'X-EditCount'?: number;      // number of edits in a chunk
}

/**
 * Manages ProgSnap2 log file writing
 */
export class ProgSnap2Writer {
  private outputDir: string;
  private mainTablePath: string;
  private codeStatesDir: string;
  private eventCounter: number = 0;
  private orderCounter: number = 0;
  private headerWritten: boolean = false;
  private onEvent?: (event: ProgSnap2Event) => void;
  private onCodeState?: (codeStateId: string, fileName: string, content: string) => void;

  constructor(outputDir: string, onEvent?: (event: ProgSnap2Event) => void, onCodeState?: (codeStateId: string, fileName: string, content: string) => void) {
    this.onEvent = onEvent;
    this.onCodeState = onCodeState;
    this.outputDir = outputDir;
    this.mainTablePath = path.join(outputDir, 'MainTable.csv');
    this.codeStatesDir = path.join(outputDir, 'CodeStates');

    // Create directories
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(this.codeStatesDir, { recursive: true });

    // Write dataset metadata
    this.writeDatasetMetadata();

    // Check if main table already exists (resume session)
    if (fs.existsSync(this.mainTablePath)) {
      this.headerWritten = true;
      // Count existing events to continue numbering
      const lines = fs.readFileSync(this.mainTablePath, 'utf-8').split('\n').filter(l => l.trim());
      this.eventCounter = Math.max(0, lines.length - 1); // minus header
      this.orderCounter = this.eventCounter;
    }
  }

  private writeDatasetMetadata(): void {
    const metaPath = path.join(this.outputDir, 'DatasetMetadata.csv');
    if (!fs.existsSync(metaPath)) {
      const meta = [
        'Property,Value',
        'Version,6',
        'IsEventOrderingConsistent,true',
        'EventOrderScope,Restricted',
        'EventOrderScopeColumns,SubjectID',
        `CodeStateRepresentation,Table`,
      ].join('\n');
      fs.writeFileSync(metaPath, meta + '\n', 'utf-8');
    }
  }

  private getHeaders(): string[] {
    return [
      'EventType', 'EventID', 'Order', 'SubjectID', 'AssignmentID',
      'Timestamp', 'EditType', 'InsertText', 'DeleteText',
      'SourceLocation', 'CodeStateID', 'CursorLine', 'CursorColumn',
      'X-PauseDuration', 'X-PauseReason', 'X-EditCount',
    ];
  }

  private escapeCSV(value: string | number | undefined): string {
    if (value === undefined || value === null) {
      return '';
    }
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  writeEvent(event: Partial<ProgSnap2Event> & { EventType: string; SubjectID: string; AssignmentID: string }): void {
    const headers = this.getHeaders();

    // Write header if needed
    if (!this.headerWritten) {
      fs.writeFileSync(this.mainTablePath, headers.join(',') + '\n', 'utf-8');
      this.headerWritten = true;
    }

    // Fill in auto-generated fields
    const fullEvent: ProgSnap2Event = {
      ...event,
      EventID: ++this.eventCounter,
      Order: ++this.orderCounter,
      Timestamp: event.Timestamp || new Date().toISOString(),
    };

    // Write row
    const row = headers.map(h => this.escapeCSV((fullEvent as any)[h])).join(',');
    fs.appendFileSync(this.mainTablePath, row + '\n', 'utf-8');

    // Send to server via callback
    if (this.onEvent) {
      this.onEvent(fullEvent);
    }
  }

  /**
   * Save a code state snapshot and return its ID
   */
  saveCodeState(content: string, fileRelativePath: string): string {
    const stateId = `state_${this.eventCounter}_${Date.now()}`;
    const stateDir = path.join(this.codeStatesDir, stateId);
    fs.mkdirSync(stateDir, { recursive: true });

    const targetPath = path.join(stateDir, fileRelativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf-8');

    // Send to server via callback
    if (this.onCodeState) {
      this.onCodeState(stateId, fileRelativePath, content);
    }

    return stateId;
  }

  getOutputDir(): string {
    return this.outputDir;
  }
}
