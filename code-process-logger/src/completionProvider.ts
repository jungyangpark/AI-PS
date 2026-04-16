import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';

/**
 * InlineCompletionProvider that calls our backend server for LLM-powered completions.
 * Replaces Cursor/Copilot dependency — works in any VS Code.
 */
export class LLMCompletionProvider implements vscode.InlineCompletionItemProvider {
  private serverUrl: string;
  private enabled: boolean = false;
  private subjectId: string = '';

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setSubjectId(subjectId: string): void {
    this.subjectId = subjectId;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!this.enabled) {
      return undefined;
    }

    // Get prefix (code before cursor) and suffix (code after cursor)
    const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
    const suffix = document.getText(new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end));

    // Determine language
    const language = document.languageId;
    const fileName = document.fileName.split('/').pop() || 'untitled';

    if (token.isCancellationRequested) { return undefined; }

    try {
      const completion = await this.fetchCompletion(prefix, suffix, language, fileName, token);

      if (!completion || token.isCancellationRequested) {
        return undefined;
      }

      return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
    } catch {
      return undefined;
    }
  }

  private fetchCompletion(
    prefix: string,
    suffix: string,
    language: string,
    fileName: string,
    token: vscode.CancellationToken,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        prefix: prefix.slice(-2000),  // Last 2000 chars for context
        suffix: suffix.slice(0, 500), // Next 500 chars
        language,
        fileName,
        subjectId: this.subjectId,
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
}
