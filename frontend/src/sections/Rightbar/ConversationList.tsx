import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useConversationStore } from '@/store/useConversationStore';
import { Plus, Trash2, MessageSquare, Loader2 } from 'lucide-react';

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

  useEffect(() => {
    if (appId) loadConversations(appId);
  }, [appId, loadConversations]);

  const handleNew = async () => {
    const conv = await createConversation(appId);
    setSearchParams({ conversation_id: String(conv.id) });
  };

  const handleSelect = async (convId: number) => {
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
              <span className="flex-1 truncate">
                {conv.title || `对话 ${conv.id}`}
              </span>
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
