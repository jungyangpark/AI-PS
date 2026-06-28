import * as vscode from 'vscode';

export class ChatbotPanel {
    public static currentPanel: ChatbotPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _chatHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.ViewColumn.Two;

        // If panel already exists, just reveal it
        if (ChatbotPanel.currentPanel) {
            ChatbotPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'aiPsChatbot',
            'AI-PS Chatbot',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ChatbotPanel.currentPanel = new ChatbotPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'sendMessage':
                        this._handleUserMessage(message.text);
                        return;
                    case 'clearHistory':
                        this._chatHistory = [];
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleUserMessage(userMessage: string) {
        // Add user message to history
        this._chatHistory.push({ role: 'user', content: userMessage });

        // Show user message in webview
        this._panel.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: userMessage
        });

        // Show loading state
        this._panel.webview.postMessage({ type: 'setLoading', loading: true });

        try {
            // Get current code context
            const editor = vscode.window.activeTextEditor;
            const currentCode = editor ? editor.document.getText() : '';
            const fileName = editor ? editor.document.fileName : 'unknown';

            // Get server URL from configuration
            const config = vscode.workspace.getConfiguration('codeProcessLogger');
            const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');

            // Call server API
            const response = await fetch(`${serverUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: userMessage,
                    currentCode,
                    fileName,
                    chatHistory: this._chatHistory
                })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json() as { response: string };
            const assistantMessage = data.response;

            // Add assistant message to history
            this._chatHistory.push({ role: 'assistant', content: assistantMessage });

            // Show assistant message in webview
            this._panel.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: assistantMessage
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

            // Show error in webview
            this._panel.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: `Error: ${errorMessage}`
            });
        } finally {
            // Hide loading state
            this._panel.webview.postMessage({ type: 'setLoading', loading: false });
        }
    }

    public dispose() {
        ChatbotPanel.currentPanel = undefined;

        // Clean up resources
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.title = 'AI-PS Chatbot';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI-PS Chatbot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        #chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .message {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 8px;
            line-height: 1.5;
        }

        .message.user {
            align-self: flex-end;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.assistant {
            align-self: flex-start;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
        }

        .message pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }

        .message code {
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }

        #input-container {
            padding: 16px;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }

        #message-input {
            flex: 1;
            padding: 10px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 14px;
            resize: none;
            min-height: 40px;
            max-height: 120px;
        }

        #message-input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        button {
            padding: 10px 20px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 14px;
            transition: background-color 0.2s;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .loading {
            align-self: flex-start;
            padding: 12px 16px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        #welcome-message {
            align-self: center;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 40px 20px;
        }

        #welcome-message h2 {
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <div id="chat-container">
        <div id="welcome-message">
            <h2>AI-PS Chatbot</h2>
            <p>코드에 대해 질문해보세요. 현재 열린 파일의 코드를 자동으로 참고합니다.</p>
        </div>
    </div>
    <div id="input-container">
        <textarea
            id="message-input"
            placeholder="질문을 입력하세요..."
            rows="1"
        ></textarea>
        <button id="send-button">전송</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chat-container');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const welcomeMessage = document.getElementById('welcome-message');

        let isLoading = false;

        // Auto-resize textarea
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });

        // Send message on button click
        sendButton.addEventListener('click', sendMessage);

        // Send message on Enter (but allow Shift+Enter for new line)
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        function sendMessage() {
            const text = messageInput.value.trim();
            if (!text || isLoading) return;

            // Hide welcome message on first message
            if (welcomeMessage) {
                welcomeMessage.remove();
            }

            vscode.postMessage({
                type: 'sendMessage',
                text: text
            });

            messageInput.value = '';
            messageInput.style.height = 'auto';
        }

        function addMessage(role, content) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + role;

            // Simple markdown-like rendering for code blocks
            const html = content
                .replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>')
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                .replace(/\\n/g, '<br>');

            messageDiv.innerHTML = html;
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function setLoading(loading) {
            isLoading = loading;
            sendButton.disabled = loading;

            if (loading) {
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'loading';
                loadingDiv.id = 'loading-indicator';
                loadingDiv.textContent = '답변 생성 중...';
                chatContainer.appendChild(loadingDiv);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            } else {
                const loadingDiv = document.getElementById('loading-indicator');
                if (loadingDiv) {
                    loadingDiv.remove();
                }
            }
        }

        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'addMessage':
                    addMessage(message.role, message.content);
                    break;
                case 'setLoading':
                    setLoading(message.loading);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
