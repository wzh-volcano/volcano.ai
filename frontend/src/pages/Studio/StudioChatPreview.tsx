import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send } from 'lucide-react';
import { api } from '@/lib/api';

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
  };
}

export const StudioChatPreview: React.FC<Props> = ({ appId, config }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '你好！我是聊天助手，有什么可以帮助你的？' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || sending) return;

    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    setSending(true);
    setError('');

    try {
      const result = await api.chatWithApp(appId, q);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.answer },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-border text-xs font-medium text-text-dim flex items-center gap-2">
        <span>预览 & 测试</span>
        <span className="text-2xs text-text-mute">
          ({config.model || '未选择模型'})
        </span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-accent text-white rounded-br-md'
                : 'bg-bg-2 border border-border text-text rounded-bl-md'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {error && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入测试消息..."
            className="h-8 text-xs"
            disabled={sending}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSend} disabled={sending || !input.trim()}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </Button>
        </div>
      </div>
    </div>
  );
};
