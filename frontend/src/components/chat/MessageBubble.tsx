import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, Eye, FileDown } from 'lucide-react';

import type { ChatMessage } from '@/types';

interface Props {
  msg: ChatMessage;
  isStreaming?: boolean;
  copiedMsgId?: number | null;
  msgIndex: number;
  onCopy: (text: string, index: number) => void;
}

const CodeBlock: React.FC<React.ComponentPropsWithoutRef<'pre'> & { streaming?: boolean }> = ({ children, streaming, ...props }) => {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [isHtml, setIsHtml] = useState(false);

  useEffect(() => {
    const text = preRef.current?.textContent || '';
    setIsHtml(/(<html|<!(DOCTYPE|--))/i.test(text));
  }, [children]);

  const handleCopy = async () => {
    if (!preRef.current) return;
    await navigator.clipboard.writeText(preRef.current.textContent || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreview = () => {
    const text = preRef.current?.textContent || '';
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(text);
      win.document.close();
    }
  };

  const handleDownload = () => {
    const text = preRef.current?.textContent || '';
    const blob = new Blob([text], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'preview.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative group/pre my-2">
      <pre ref={preRef} {...props} className="bg-bg-3 border border-border rounded-lg p-3 overflow-x-auto text-xs leading-relaxed !mt-0 !mb-0">
        {children}
      </pre>
      <div className={`absolute top-2 right-2 flex gap-1 ${streaming ? 'hidden' : 'opacity-0 group-hover/pre:opacity-100 transition-opacity'}`}>
        {isHtml && (
          <>
            <button className="w-6 h-6 flex items-center justify-center rounded bg-bg-2 border border-border text-text-mute hover:text-text" onClick={handlePreview} title="预览 HTML"><Eye size={12} /></button>
            <button className="w-6 h-6 flex items-center justify-center rounded bg-bg-2 border border-border text-text-mute hover:text-text" onClick={handleDownload} title="下载 HTML"><FileDown size={12} /></button>
          </>
        )}
        <button className="w-6 h-6 flex items-center justify-center rounded bg-bg-2 border border-border text-text-mute hover:text-text" onClick={handleCopy}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>
      </div>
    </div>
  );
};

const MessageBubbleInner: React.FC<Props> = ({ msg, isStreaming, copiedMsgId, msgIndex, onCopy }) => {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
        msg.role === 'user'
          ? 'bg-accent text-white rounded-br-md'
          : 'bg-bg-2 border border-border text-text rounded-bl-md'
      }`}>
        {msg.role === 'user' ? (
          msg.content
        ) : msg.content ? (
          <div className="relative group/markdown">
            <div className="markdown-content prose prose-invert prose-xs max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{ pre: (props: any) => <CodeBlock {...props} streaming={isStreaming} /> }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
            {!isStreaming && (
              <div className="flex justify-end -mb-1 mt-1">
                <button
                  className="w-5 h-5 flex items-center justify-center rounded text-text-mute hover:text-text hover:bg-bg-hover transition-colors opacity-0 group-hover/markdown:opacity-100"
                  onClick={() => onCopy(msg.content, msgIndex)}
                >
                  {copiedMsgId === msgIndex ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="flex gap-1.5 items-center px-1 py-0.5">
            <span className="w-2 h-2 bg-text-dim rounded-full animate-think" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-text-dim rounded-full animate-think" style={{ animationDelay: '300ms' }} />
            <span className="w-2 h-2 bg-text-dim rounded-full animate-think" style={{ animationDelay: '600ms' }} />
          </span>
        )}
      </div>
    </div>
  );
};

export const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  return prev.msg.content === next.msg.content
    && prev.msg.role === next.msg.role
    && prev.isStreaming === next.isStreaming
    && prev.copiedMsgId === next.copiedMsgId;
});
