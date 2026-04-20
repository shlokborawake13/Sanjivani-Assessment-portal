import { useState, useCallback, useRef } from 'react'

/**
 * SecureCodeEditor — Controlled code editor with paste/copy blocking,
 * typing speed tracking, and monospace styling.
 */
export default function SecureCodeEditor({ value, onChange, language = 'javascript', onViolation, readOnly = false }) {
  const [lineCount, setLineCount] = useState(1)
  const textareaRef = useRef(null)
  const keystrokeCount = useRef(0)
  const startTime = useRef(Date.now())

  const handleChange = useCallback((e) => {
    const val = e.target.value
    const lines = val.split('\n').length
    setLineCount(lines)
    keystrokeCount.current++
    if (onChange) onChange(val)
  }, [onChange])

  const handlePaste = useCallback((e) => {
    e.preventDefault()
    if (onViolation) onViolation('paste_attempt', 'Paste attempted in code editor')
  }, [onViolation])

  const handleCopy = useCallback((e) => {
    e.preventDefault()
    if (onViolation) onViolation('copy_attempt', 'Copy attempted in code editor')
  }, [onViolation])

  const handleCut = useCallback((e) => {
    e.preventDefault()
    if (onViolation) onViolation('copy_attempt', 'Cut attempted in code editor')
  }, [onViolation])

  const handleKeyDown = useCallback((e) => {
    // Allow Tab for indentation
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const val = ta.value
      const newVal = val.substring(0, start) + '  ' + val.substring(end)
      if (onChange) onChange(newVal)
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      }, 0)
      return
    }

    // Block Ctrl+C, Ctrl+V, Ctrl+X
    if (e.ctrlKey && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      if (e.key.toLowerCase() === 'v' && onViolation) {
        onViolation('paste_attempt', 'Ctrl+V in code editor')
      }
    }
  }, [onChange, onViolation])

  const getTypingSpeed = () => {
    const elapsed = (Date.now() - startTime.current) / 60000 // minutes
    if (elapsed < 0.1) return 0
    return Math.round(keystrokeCount.current / elapsed)
  }

  const langColors = {
    javascript: '#f7df1e',
    python: '#3776ab',
    cpp: '#00599c',
    java: '#ed8b00',
  }

  return (
    <div className="rounded-xl overflow-hidden border border-outline/20" style={{ boxShadow: 'var(--shadow-ambient)' }}>
      {/* Editor header */}
      <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] font-medium text-[#888] ml-3">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: langColors[language] || '#888' }} />
            {language}
          </span>
        </div>
        <span className="text-[10px] text-[#555]">
          {getTypingSpeed()} keystrokes/min
        </span>
      </div>

      {/* Editor body */}
      <div className="flex bg-[#1e1e2e] min-h-[400px]">
        {/* Line numbers */}
        <div className="flex flex-col items-end py-3 px-3 bg-[#191929] select-none shrink-0 min-w-[48px]">
          {Array.from({ length: Math.max(lineCount, 20) }, (_, i) => (
            <span key={i} className="text-[12px] leading-[21px] text-[#555] font-mono">{i + 1}</span>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onCopy={handleCopy}
          onCut={handleCut}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className="flex-1 bg-transparent text-[#e4e4e7] font-mono text-[13px] leading-[21px] p-3 outline-none resize-none w-full"
          style={{ tabSize: 2, userSelect: 'text', caretColor: '#f7df1e' }}
          placeholder="// Write your code here..."
        />
      </div>
    </div>
  )
}
