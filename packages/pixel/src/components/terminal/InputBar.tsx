import { useState, useRef, useEffect, useCallback } from 'react';
import type { ImageAttachment } from '../../types';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

interface Props {
  mode: 'talk' | 'do';
  onModeChange: (mode: 'talk' | 'do') => void;
  onSend: (content: string, attachments?: ImageAttachment[]) => void;
  disabled?: boolean;
  disabledReason?: string;
  onStop?: () => void;
}

export default function InputBar({ mode, onModeChange, onSend, disabled, disabledReason, onStop }: Props) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [value]);

  // Clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const processFile = useCallback(async (file: File): Promise<ImageAttachment | null> => {
    // Validate file type
    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError(`Unsupported format: ${file.type}. Use PNG, JPG, GIF, or WebP.`);
      return null;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max 5MB.`);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Extract base64 data (remove data:image/...;base64, prefix)
        const base64Data = result.split(',')[1];
        resolve({
          type: 'image',
          data: base64Data,
          name: file.name,
          mediaType: file.type as ImageAttachment['mediaType'],
        });
      };
      reader.onerror = () => {
        setError('Failed to read file');
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const processed: ImageAttachment[] = [];

    for (const file of fileArray) {
      const attachment = await processFile(file);
      if (attachment) {
        processed.push(attachment);
      }
    }

    if (processed.length > 0) {
      setAttachments((prev) => [...prev, ...processed]);
    }
  }, [processFile]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  // Paste handler
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  }, [handleFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFiles]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setValue('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (composingRef.current) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={`border-t border-[var(--terminal-border)] p-3 shrink-0 transition-colors ${
        isDragging ? 'bg-[var(--terminal-surface-light)] border-amber-500/50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Error message */}
      {error && (
        <div className="text-[10px] text-red-400 mb-2 text-center">{error}</div>
      )}
      {disabledReason && (
        <div className="text-[10px] text-amber-400/70 mb-2 text-center">{disabledReason}</div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="relative group w-16 h-16 rounded-lg overflow-hidden border border-[var(--terminal-border)] bg-[var(--terminal-inline-bg)]"
            >
              <img
                src={`data:${att.mediaType};base64,${att.data}`}
                alt={att.name}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => removeAttachment(idx)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                x
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white truncate px-1 py-0.5">
                {att.name}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drag overlay hint */}
      {isDragging && (
        <div className="text-[11px] text-amber-400 text-center mb-2">
          Drop image here
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-[var(--terminal-border)] shrink-0">
          <button
            onClick={() => onModeChange('talk')}
            className={`px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
              mode === 'talk'
                ? 'bg-[var(--desk-wood)] text-white'
                : 'bg-[var(--terminal-inline-bg)] text-[var(--terminal-text-secondary)] hover:text-[var(--terminal-text)]'
            }`}
          >
            Talk
          </button>
          <button
            onClick={() => onModeChange('do')}
            className={`px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
              mode === 'do'
                ? 'bg-amber-700 text-white'
                : 'bg-[var(--terminal-inline-bg)] text-[var(--terminal-text-secondary)] hover:text-[var(--terminal-text)]'
            }`}
          >
            Do
          </button>
        </div>

        {/* File attachment button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="w-8 h-8 rounded-lg bg-[var(--terminal-inline-bg)] border border-[var(--terminal-border)] text-[var(--terminal-text-muted)] flex items-center justify-center shrink-0 cursor-pointer hover:bg-[var(--terminal-surface-light)] hover:text-[var(--terminal-text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Attach image (PNG, JPG, GIF, WebP)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onPaste={handlePaste}
          placeholder={disabled ? 'Waiting...' : mode === 'talk' ? 'Ask something...' : 'Give a directive...'}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-[var(--terminal-inline-bg)] border border-[var(--terminal-border)] rounded-lg px-3 py-2 text-sm text-[var(--terminal-text)] placeholder:text-[var(--terminal-text-muted)] resize-none focus:outline-none focus:border-[var(--terminal-border-hover)] disabled:opacity-40 terminal-scrollbar"
        />

        {/* Stop (visible when streaming) */}
        {disabled && onStop && (
          <button
            onClick={onStop}
            className="w-8 h-8 rounded-lg bg-red-900/40 text-red-400 flex items-center justify-center shrink-0 cursor-pointer hover:bg-red-900/60 hover:text-red-300 transition-colors"
            title="Stop"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
          </button>
        )}

        {/* Send */}
        <button
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && attachments.length === 0)}
          className="w-8 h-8 rounded-lg bg-[var(--terminal-surface-light)] text-[var(--terminal-text-secondary)] flex items-center justify-center shrink-0 cursor-pointer hover:bg-[var(--desk-wood)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
