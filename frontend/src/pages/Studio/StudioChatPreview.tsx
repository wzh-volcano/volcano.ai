import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Copy, Check, ChevronDown, Pause, Play, Square, Eye, FileDown, Shrink, Loader2, Gauge } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  appId: number;
  config: {
    model: string;
    provider: string;
    prompt: string;
    skill_ids: number[];
    kb_ids: number[];
    maxTokens?: number;
  };
}

const SCROLL_BOTTOM_THRESHOLD = 150;

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
            <button
              className="w-6 h-6 flex items-center justify-center rounded bg-bg-2 border border-border text-text-mute hover:text-text"
              onClick={handlePreview}
              title="预览 HTML"
            >
              <Eye size={12} />
            </button>
            <button
              className="w-6 h-6 flex items-center justify-center rounded bg-bg-2 border border-border text-text-mute hover:text-text"
              onClick={handleDownload}
              title="下载 HTML"
            >
              <FileDown size={12} />
            </button>
          </>
        )}
        <button
          className="w-6 h-6 flex items-center justify-center rounded bg-bg-2 border border-border text-text-mute hover:text-text"
          onClick={handleCopy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
};

export const StudioChatPreview: React.FC<Props> = ({ appId, config }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '你好！我是聊天助手，有什么可以帮助你的？' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null);
  const [compressUntil, setCompressUntil] = useState(-1);
  const [compressSummary, setCompressSummary] = useState('');
  const [compressExpanded, setCompressExpanded] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  const MAX_TOKENS = config.maxTokens ?? 128000;
  const estimateTokens = (text: string) => Math.ceil(text.length / 2);
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const contextPercent = Math.min(Math.round(totalTokens / MAX_TOKENS * 100), 99);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setIsNearBottom(scrollHeight - scrollTop - clientHeight < SCROLL_BOTTOM_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    setIsNearBottom(true);
  }, []);

  useEffect(() => {
    if (isNearBottom && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isNearBottom]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleCopyContent = async (text: string, msgIndex: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedMsgId(msgIndex);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const startStream = useCallback(async (question: string, history: ChatMessage[] = []) => {
    setSending(true);
    setPaused(false);
    setError('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem('volcano_token');
      const response = await fetch(`/api/apps/${appId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question,
          stream: true,
          messages: history.length > 0 ? history : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.done) { streamDone = true; break; }
            if (parsed.token) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + parsed.token };
                }
                return next;
              });
            }
            if (parsed.error) {
              setError(parsed.error);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e instanceof Error ? e.message : '请求失败');
      }
    } finally {
      if (!pausedRef.current) {
        setSending(false);
        setPaused(false);
      }
      pausedRef.current = false;
      abortRef.current = null;
    }
  }, [appId]);

  const handleSend = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;

    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    await startStream(q);
  }, [input, sending, startStream]);

  const handlePause = useCallback(() => {
    pausedRef.current = true;
    abortRef.current?.abort();
    setPaused(true);
  }, []);

  const handleResume = useCallback(async () => {
    await startStream('', messages);
  }, [messages, startStream]);

  const handleCompress = useCallback(async () => {
    if (compressing || sending || paused) return;
    setCompressing(true);
    try {
      const token = localStorage.getItem('volcano_token');
      const msgs = messages.slice(1);
      const response = await fetch(`/api/apps/${appId}/compress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: msgs }),
      });
      if (!response.ok) throw new Error('压缩失败');
      const data = await response.json();
      setCompressSummary(data.summary);
      setCompressUntil(messages.length - 1);
      setCompressExpanded(false);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : '压缩失败');
    } finally {
      setCompressing(false);
    }
  }, [messages, appId, compressing, sending, paused]);

  return (
    <>
      <style>{`
        @keyframes think {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        .animate-think { animation: think 1.4s ease-in-out infinite; }
        .markdown-content .hljs { background: transparent !important; }
        .markdown-content pre:first-child { margin-top: 0; }
        .markdown-content pre:last-child { margin-bottom: 0; }
        .markdown-content p:first-child { margin-top: 0; }
        .markdown-content p:last-child { margin-bottom: 0; }
      `}</style>
      <div className="flex flex-col h-full">
        <div className="px-4 py-2.5 border-b border-border text-xs font-medium text-text-dim flex items-center gap-2 shrink-0">
          <span>预览 & 测试</span>
          <span className="text-2xs text-text-mute">
            ({config.model || '未选择模型'})
          </span>
        </div>

        <div className="flex-1 relative min-h-0">
          <div ref={listRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto px-4 py-3 space-y-3">
            {/* Compression separator */}
            {compressUntil >= 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-border" />
                  <button
                    className="flex items-center gap-1.5 text-2xs text-text-mute hover:text-text shrink-0 transition-colors"
                    onClick={() => setCompressExpanded(!compressExpanded)}
                  >
                    <Shrink size={11} />
                    <span>上下文已压缩</span>
                    <ChevronDown size={11} className={`transition-transform duration-200 ${compressExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {compressExpanded && (
                  <div className="text-2xs text-text-dim bg-bg-3 border border-border rounded-lg px-3 py-2 leading-relaxed">
                    <span className="font-medium text-text">摘要：</span>
                    {compressSummary}
                  </div>
                )}
                {compressExpanded && messages.slice(0, compressUntil + 1).map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-accent/70 text-white rounded-br-md'
                        : 'bg-bg-2/60 border border-border/60 text-text-dim rounded-bl-md'
                    }`}>
                      {msg.role === 'user' ? msg.content : msg.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active messages (after compression point or all if not compressed) */}
            {messages.slice(compressUntil + 1).map((msg, i) => {
              const realIndex = compressUntil + 1 + i;
              return (
                <div key={realIndex} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                            components={{ pre: (props: any) => <CodeBlock {...props} streaming={sending && realIndex === messages.length - 1} /> }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                        {(!sending || realIndex !== messages.length - 1) && (
                          <div className="flex justify-end -mb-1 mt-1">
                            <button
                              className="w-5 h-5 flex items-center justify-center rounded text-text-mute hover:text-text hover:bg-bg-hover transition-colors opacity-0 group-hover/markdown:opacity-100"
                              onClick={() => handleCopyContent(msg.content, realIndex)}
                            >
                              {copiedMsgId === realIndex ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : paused ? (
                      <span className="text-text-mute text-xs">已暂停</span>
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
            })}
            {error && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
                <span>{error}</span>
              </div>
            )}
          </div>

          {!isNearBottom && (
            <button
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-bg-2 border border-border shadow-md flex items-center justify-center text-text-dim hover:text-text hover:border-text-mute transition-colors z-10"
              onClick={scrollToBottom}
            >
              <ChevronDown size={16} />
            </button>
          )}
        </div>

        <div className="mx-3 mb-3 bg-bg-2 border border-border-strong rounded-2xl px-3.5 py-2.5 shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入测试消息..."
            className="w-full bg-transparent border-0 outline-none text-text text-[13px] px-0.5 pt-1 pb-2 placeholder-text-mute"
            disabled={sending && !paused}
          />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 text-text-mute cursor-default">
                      <Gauge size={12} />
                      <span className="text-2xs">{contextPercent}%</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">上下文占用 {contextPercent}%</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {contextPercent > 10 && messages.length > 1 && !sending && !paused && (
                <button
                  className="w-5 h-5 flex items-center justify-center rounded text-text-mute hover:text-text hover:bg-bg-hover transition-colors"
                  onClick={handleCompress}
                  title="压缩上下文"
                >
                  {compressing ? <Loader2 size={10} className="animate-spin" /> : <Shrink size={10} />}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {sending && !paused ? (
                <button
                  className="w-[30px] h-[30px] rounded-full bg-bg-3 border border-border text-text-dim inline-flex items-center justify-center transition-colors duration-150 hover:text-text hover:border-text-mute"
                  onClick={handlePause}
                >
                  <Pause size={14} />
                </button>
              ) : paused ? (
                <>
                  <button
                    className="w-[30px] h-[30px] rounded-full bg-accent text-white inline-flex items-center justify-center transition-colors duration-150 hover:bg-accent/80"
                    onClick={handleResume}
                  >
                    <Play size={14} />
                  </button>
                  <button
                    className="w-[30px] h-[30px] rounded-full bg-bg-3 border border-border text-text-dim inline-flex items-center justify-center transition-colors duration-150 hover:text-text hover:border-text-mute"
                    onClick={() => { setPaused(false); setSending(false); }}
                  >
                    <Square size={12} />
                  </button>
                </>
              ) : (
                <button
                  className="w-[30px] h-[30px] rounded-full bg-accent text-white inline-flex items-center justify-center transition-colors duration-150 hover:bg-accent/80 disabled:opacity-50"
                  onClick={handleSend}
                  disabled={!input.trim()}
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
