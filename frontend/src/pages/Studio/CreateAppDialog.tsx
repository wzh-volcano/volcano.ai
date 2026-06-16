import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { App } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: App;
  onSubmit: (data: { name: string; icon?: string; description?: string }) => Promise<void>;
}

const ICON_OPTIONS = ['🤖', '💬', '🧠', '📚', '🔍', '✨', '🎯', '⚡', '🛠️', '🎨', '📊', '🔗'];

export const CreateAppDialog: React.FC<Props> = ({ open, onOpenChange, initialData, onSubmit }) => {
  const [name, setName] = useState(initialData?.name ?? '');
  const [icon, setIcon] = useState(initialData?.icon ?? '🤖');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '');
      setIcon(initialData?.icon ?? '🤖');
      setDescription(initialData?.description ?? '');
      setError('');
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('应用名称不能为空');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), icon, description: description.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{initialData ? '编辑应用' : '创建应用'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="app-name">应用名称</Label>
            <Input
              id="app-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="例如：智能客服助手"
              disabled={submitting}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>应用图标</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg border text-lg inline-flex items-center justify-center transition-colors ${
                    icon === ic
                      ? 'border-accent bg-accent/15'
                      : 'border-border bg-bg-2 hover:bg-bg-hover'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="app-desc">应用介绍</Label>
            <Textarea
              id="app-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述应用的功能和用途..."
              rows={3}
              disabled={submitting}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {initialData ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
