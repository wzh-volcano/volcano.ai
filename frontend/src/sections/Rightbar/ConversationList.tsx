import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useConversationStore } from '@/store/useConversationStore';
import { Plus, Trash2, MessageSquare, Loader2, Check, X } from 'lucide-react';

export const ConversationList: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [, setSearchParams] = useSearchParams();
  const appId = Number(id);

  const conversations = useConversationStore((s) => s.conversations);
  const currentConvId = useConversationStore((s) => s.currentConvId);
  const loading = useConversationStore((s) => s.loading);
  const loadConversations = useConversationStore((s) => s.loadConversations);
  const createConversation = useConversationStore((s) => s.createConversation);
  const selectConversation = useConversationStore((s) => s.selectConversation);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);
  const updateTitle = useConversationStore((s) => s.updateTitle);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (appId) loadConversations(appId);
  }, [appId, loadConversations]);

  useEffect(() => {
    if (editingId !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  const handleNew = async () => {
    const conv = await createConversation(appId);
    setSearchParams({ conversation_id: String(conv.id) });
  };

  const handleSelect = async (convId: number) => {
    if (editingId !== null) return;
    await selectConversation(convId);
    setSearchParams({ conversation_id: String(convId) });
  };

  const handleDelete = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation();
    const prevConvId = currentConvId;
    await deleteConversation(convId, appId);
    if (prevConvId === convId) {
      setSearchParams({});
    }
  };

  const handleStartEdit = (e: React.MouseEvent, convId: number, currentTitle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingId(convId);
    setEditValue(currentTitle || '');
  };

  const handleSaveEdit = async () => {
    const id = editingId;
    if (id === null) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      try {
        await updateTitle(id, trimmed);
      } catch { /* ignore */ }
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditValue('');
  };

  const handleEditKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-medium text-text">对话历史</h3>
        <button
          onClick={handleNew}
          className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} /> 新对话
        </button>
      </div>

      {loading && conversations.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-text-dim" />
        </div>
      ) : conversations.length === 0 ? (
        <p className="text-[12px] text-text-dim text-center py-8">暂无对话记录</p>
      ) : (
        <ul className="flex-1 overflow-y-auto space-y-1">
          {conversations.map((conv) => (
            <li
              key={conv.id}
              onClick={() => handleSelect(conv.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] cursor-pointer transition-colors group ${
                currentConvId === conv.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-text hover:bg-bg-hover'
              }`}
            >
              <MessageSquare size={14} className="shrink-0" />
              {editingId === conv.id ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={handleSaveEdit}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-bg-active border border-border rounded px-1.5 py-0.5 text-[12px] text-text outline-none"
                  />
                  <button onClick={handleSaveEdit} className="shrink-0 text-text-dim hover:text-text" title="确认">
                    <Check size={12} />
                  </button>
                  <button onClick={handleCancelEdit} className="shrink-0 text-text-dim hover:text-text" title="取消">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <span
                  className="flex-1 truncate"
                  onDoubleClick={(e) => handleStartEdit(e, conv.id, conv.title)}
                  title="双击重命名"
                >
                  {conv.title || `对话 ${conv.id}`}
                </span>
              )}
              <span className="text-[10px] text-text-dim">{conv.message_count}</span>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-error transition-all"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
