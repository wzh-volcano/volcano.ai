import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { Pencil, Trash2, MessageCircle } from 'lucide-react';
import type { App } from '@/types';

interface Props {
  app: App;
  onEdit: (app: App) => void;
  onDelete: (app: App) => void;
}

export const StudioAppCard: React.FC<Props> = ({ app, onEdit, onDelete }) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';

  const statusLabel = app.status === 'published' ? '已发布' : '草稿';
  const statusClass = app.status === 'published'
    ? 'bg-success/15 text-success'
    : 'bg-bg-3 text-text-dim border border-border';

  return (
    <div
      className="group flex flex-col p-4 rounded-xl border border-border bg-bg-2 hover:bg-bg-hover hover:border-border-strong transition-colors duration-150 cursor-pointer"
      onClick={() => navigate(`/studio/${app.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-xl bg-bg-3 border border-border inline-flex items-center justify-center shrink-0 text-lg">
          {app.icon || '🤖'}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(app); }}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-active transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(app); }}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-error hover:bg-error/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <h3 className="text-sm font-medium text-text mt-3 truncate">{app.name}</h3>
      <p className="text-xs text-text-dim mt-1 line-clamp-2 h-8">{app.description || '暂无描述'}</p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs ${statusClass}`}>
          {statusLabel}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-accent/15 text-accent">
          <MessageCircle size={10} />
          聊天助手
        </span>
      </div>
      {isAdmin && app.ownerUsername && (
        <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-3 border border-border text-2xs text-text-dim">
          <span className="text-text-mute">拥有者：</span>
          <span className="text-text">{app.ownerUsername}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-2xs text-text-mute">
        <span>{app.type === 'chat_assistant' ? '聊天助手' : app.type}</span>
        <span>更新于 {app.updatedAt}</span>
      </div>
    </div>
  );
};
