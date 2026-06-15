import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Chip } from '@/components/Chip';
import { Plus, Settings, RefreshCw, Zap, ArrowUp } from 'lucide-react';

const FileTag: React.FC<{ name: string; type?: string }> = ({ name, type }) => {
  const colorMap: Record<string, string> = {
    js: 'text-[#f5d76e]',
    css: 'text-[#6ec1ff]',
    html: 'text-[#c8cfd8]',
  };
  return (
    <span
      className={`
        inline-flex items-center gap-1
        text-xs px-2 py-0.5 rounded
        bg-bg-3 border border-border
        ${colorMap[type || 'other'] || 'text-[#c8cfd8]'}
      `}
    >
      <span className="text-xs">
        {type === 'html' ? '📄' : type === 'js' ? '📜' : type === 'css' ? '🎨' : '📄'}
      </span>
      {name}
    </span>
  );
};

const ActionTag: React.FC<{ action: NonNullable<import('@/types').Message['action']> }> = ({ action }) => {
  const iconMap: Record<string, string> = {
    search: '🔍',
    run: '⌘',
    write: '✎',
    update: '✎',
  };

  return (
    <span className="inline-flex items-center flex-wrap gap-1.5 text-xs text-text-dim">
      <span className="text-text-dim">
        {iconMap[action.type]} {action.label}
      </span>
      {action.code && (
        <code className="bg-bg-3 px-2 py-0.5 rounded border border-border text-[#c5cdd6]">
          {action.code}
        </code>
      )}
      {action.files && (
        <>
          {action.files.map((f) => (
            <FileTag key={f.name} name={f.name} type={f.type} />
          ))}
        </>
      )}
      {action.diffAdd !== undefined && (
        <span className="text-success text-xs">+{action.diffAdd}</span>
      )}
      {action.diffDel !== undefined && (
        <span className="text-error text-xs">-{action.diffDel}</span>
      )}
    </span>
  );
};

export const MainContent: React.FC = () => {
  const messages = useAppStore((s) => s.messages);

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* 对话区 */}
      <div className="flex-1 overflow-y-auto px-9 py-7 max-w-[820px] w-full mx-auto">
        {messages.map((msg) => (
          <div key={msg.id} className="my-3.5">
            {msg.type === 'action' && msg.action && (
              <div className="flex flex-wrap gap-1.5">
                <ActionTag action={msg.action} />
              </div>
            )}
            {msg.type === 'text' && msg.content && (
              <p className="text-[13.5px] text-[#c8cfd8] leading-relaxed my-3.5">
                {msg.content.split(/(`[^`]+`)/).map((part, i) =>
                  part.startsWith('`') && part.endsWith('`') ? (
                    <code key={i} className="inline text-xs bg-[#2a2f37] px-1.5 py-px rounded text-[#c5cdd6]">
                      {part.slice(1, -1)}
                    </code>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <div className="mx-9 mb-6 bg-bg-2 border border-border-strong rounded-2xl px-3.5 py-3 max-w-[820px] w-[calc(100%-72px)] self-center">
        <input
          type="text"
          placeholder="继续输入后续修改需求"
          className="w-full bg-transparent border-0 outline-none text-text text-[13.5px] px-0.5 pt-1.5 pb-3 placeholder-text-mute"
        />
        <div className="flex justify-between items-center gap-2">
          <div className="flex gap-2 items-center">
            <Chip>
              <Plus size={14} />
            </Chip>
            <Chip>
              <Settings size={14} />
              <span>变更前确认</span>
              <span className="text-[10px]">▾</span>
            </Chip>
          </div>
          <div className="flex gap-2 items-center">
            <Chip ghost>
              <RefreshCw size={14} />
            </Chip>
            <Chip ghost>
              <span>GLM-5.2</span>
              <span className="text-[10px]">▾</span>
            </Chip>
            <Chip ghost>
              <Zap size={14} />
              <span>最大</span>
            </Chip>
            <button className="w-[30px] h-[30px] rounded-full bg-[#3a3f48] text-white inline-flex items-center justify-center text-sm transition-colors duration-150 hover:bg-accent">
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
