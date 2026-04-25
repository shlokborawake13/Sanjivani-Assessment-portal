import { useState, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'

/**
 * SecureCodeEditor — Monaco-based code editor with security restrictions.
 * 
 * Features:
 * - Full syntax highlighting via Monaco
 * - Copy/paste/cut blocked in strict mode
 * - Typing speed tracking for anomaly detection
 * - Multiple language support
 * - Dark theme matching assessment UI
 */
export default function SecureCodeEditor({
  value,
  onChange,
  language = 'javascript',
  onViolation,
  readOnly = false,
  strictMode = true,
  height = '400px',
}) {
  const [lineCount, setLineCount] = useState(1)
  const editorRef = useRef(null)
  const keystrokeCount = useRef(0)
  const startTime = useRef(Date.now())

  const languageMap = {
    javascript: 'javascript',
    python: 'python',
    cpp: 'cpp',
    'c++': 'cpp',
    c: 'c',
    java: 'java',
    go: 'go',
    rust: 'rust',
    typescript: 'typescript',
  }

  const langColors = {
    javascript: '#f7df1e',
    python: '#3776ab',
    cpp: '#00599c',
    c: '#A8B9CC',
    java: '#ed8b00',
    go: '#00ADD8',
    rust: '#CE412B',
    typescript: '#3178c6',
  }

  const monacoLang = languageMap[language.toLowerCase()] || 'plaintext'

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor

    if (strictMode) {
      // Disable built-in copy/paste/cut key bindings
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
        onViolation?.('copy_attempt', 'Copy blocked in code editor')
      })
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
        onViolation?.('paste_attempt', 'Paste blocked in code editor')
      })
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {
        onViolation?.('copy_attempt', 'Cut blocked in code editor')
      })

      // Disable context menu
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F10, () => {})
    }

    // Track keystrokes
    editor.onKeyDown(() => {
      keystrokeCount.current++
    })
  }

  function handleEditorChange(val) {
    const newVal = val || ''
    setLineCount(newVal.split('\n').length)
    onChange?.(newVal)
  }

  const getTypingSpeed = () => {
    const elapsed = (Date.now() - startTime.current) / 60000
    if (elapsed < 0.1) return 0
    return Math.round(keystrokeCount.current / elapsed)
  }

  // Intercept paste at DOM level too (Monaco might not catch all)
  const handlePaste = useCallback((e) => {
    if (strictMode) {
      e.preventDefault()
      onViolation?.('paste_attempt', 'Paste intercepted in code editor')
    }
  }, [strictMode, onViolation])

  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10"
      onPaste={handlePaste}
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}
    >
      {/* Editor header */}
      <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] font-medium text-[#888] ml-3">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5"
              style={{ background: langColors[monacoLang] || '#888' }}
            />
            {language}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-[#555]">
            {lineCount} lines
          </span>
          <span className="text-[10px] text-[#555]">
            {getTypingSpeed()} keys/min
          </span>
        </div>
      </div>

      {/* Monaco editor */}
      <Editor
        height={height}
        language={monacoLang}
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          glyphMargin: false,
          folding: true,
          wordWrap: 'on',
          automaticLayout: true,
          readOnly: readOnly,
          // Security: disable some features
          contextmenu: !strictMode,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          tabSize: 2,
          renderWhitespace: 'selection',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          padding: { top: 12, bottom: 12 },
          overviewRulerBorder: false,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
      />
    </div>
  )
}
