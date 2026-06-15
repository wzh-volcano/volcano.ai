import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { KnowledgeBase } from '@/types';

interface KnowledgeBaseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: KnowledgeBase;
  onSubmit: (name: string, description: string) => void;
}

export const KnowledgeBaseForm: React.FC<KnowledgeBaseFormProps> = ({
  open,
  onOpenChange,
  initialData,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '');
      setDescription(initialData?.description ?? '');
      setError('');
    }
  }, [open, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('知识库名称不能为空');
      return;
    }
    onSubmit(name.trim(), description.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{initialData ? '编辑知识库' : '新建知识库'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="kb-name">名称</Label>
              <Input
                id="kb-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="输入知识库名称"
                autoFocus
              />
              {error && <span className="text-xs text-error">{error}</span>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kb-desc">描述</Label>
              <Textarea
                id="kb-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入知识库描述（选填）"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">{initialData ? '保存' : '创建'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
