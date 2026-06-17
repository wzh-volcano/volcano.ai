import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Loader2, Copy, Check, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { ApiKey, ApiKeyCreated } from '@/types';

export const ApiKeysPage: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirmKeyId, setDeleteConfirmKeyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listApiKeys();
      setKeys(data);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    const name = newKeyName.trim();
    if (!name) return;
    setCreateLoading(true);
    setError('');
    try {
      const key = await api.createApiKey(name);
      setCreatedKey(key);
      setNewKeyName('');
      setCopied(false);
      fetchKeys();
    } catch {
      setError('创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !createLoading && newKeyName.trim()) {
      handleCreate();
    }
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.full_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (keyId: number) => {
    setDeletingId(keyId);
    try {
      await api.deleteApiKey(keyId);
      fetchKeys();
    } catch {
      setError('删除失败');
    } finally {
      setDeletingId(null);
      setDeleteConfirmKeyId(null);
    }
  };

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <KeyRound size={20} className="text-accent" />
          <h1 className="text-lg font-semibold text-text">API Key 管理</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-2xl space-y-6">

          {/* 创建 */}
          <div className="flex gap-2">
            <Input
              value={newKeyName}
              onChange={(e) => { setNewKeyName(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="输入密钥名称，如「开发环境」"
              className="flex-1"
            />
            <Button onClick={handleCreate} disabled={createLoading || !newKeyName.trim()}>
              {createLoading && <Loader2 size={14} className="animate-spin" />}
              创建
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* 新创建的 Key 展示 */}
          {createdKey && (
            <div className="p-4 rounded-lg border border-accent/30 bg-accent/5 space-y-3">
              <p className="text-sm font-medium text-text">API Key 已创建</p>
              <p className="text-xs text-text-dim">请立即复制保存。关闭后将无法再次查看完整密钥。</p>
              <div className="flex items-center gap-2 p-3 rounded-md bg-bg-active border border-border font-mono text-xs break-all">
                <span className="flex-1 select-all">{createdKey.full_key}</span>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-1.5 rounded hover:bg-bg-hover transition-colors"
                  title="复制"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCreatedKey(null)}>
                关闭
              </Button>
            </div>
          )}

          {/* Key 列表 */}
          <div>
            <h2 className="text-sm font-medium text-text mb-3">已有密钥</h2>
            <div className="space-y-2">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-text-dim" />
                </div>
              ) : keys.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-text-dim">
                  <KeyRound size={24} />
                  <p className="text-sm">暂无 API Key</p>
                </div>
              ) : (
                keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center gap-3 p-3 rounded-md border border-border bg-bg-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text font-medium truncate">{key.name}</p>
                      <p className="text-xs text-text-dim font-mono">{key.key_prefix}...</p>
                      <p className="text-xs text-text-mute">
                        创建于 {new Date(key.created_at).toLocaleDateString()}
                        {key.last_used_at ? ` · 最后使用 ${new Date(key.last_used_at).toLocaleDateString()}` : ' · 未使用'}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteConfirmKeyId(key.id)}
                      disabled={deletingId === key.id}
                      className="shrink-0 p-1.5 rounded text-text-dim hover:text-error hover:bg-bg-hover transition-colors disabled:opacity-50"
                      title="删除"
                    >
                      {deletingId === key.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      {/* 删除确认弹窗 */}
      <Dialog open={deleteConfirmKeyId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmKeyId(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定删除该 API Key？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmKeyId(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => deleteConfirmKeyId && handleDelete(deleteConfirmKeyId)}>
              {deletingId ? <Loader2 size={14} className="animate-spin" /> : null}
              确定删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
