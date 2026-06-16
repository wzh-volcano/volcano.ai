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
import type { ChunkMethod, KbCreatePayload, KnowledgeBase } from '@/types';

interface KnowledgeBaseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: KnowledgeBase;
  /** 创建模式返回完整 payload；编辑模式仅 name/description 有效。 */
  onSubmit: (payload: KbCreatePayload) => void;
}

const CHUNK_METHODS: { value: ChunkMethod; label: string; desc: string }[] = [
  {
    value: 'general_auto',
    label: '通用-自动',
    desc: '默认。按段落/句子自动切分，适合大多数文档。',
  },
  {
    value: 'general_custom',
    label: '通用-自定义',
    desc: '使用自定义分隔符切分，灵活控制。',
  },
  {
    value: 'markdown_header',
    label: 'Markdown 标题分段',
    desc: '按 # 标题层级切分，标题作为前缀保留上下文。',
  },
  {
    value: 'parent_child',
    label: '父子分段',
    desc: '两层结构：检索命中子块但返回父块，兼顾精度与上下文完整。',
  },
];

export const KnowledgeBaseForm: React.FC<KnowledgeBaseFormProps> = ({
  open,
  onOpenChange,
  initialData,
  onSubmit,
}) => {
  const isEdit = !!initialData;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chunkMethod, setChunkMethod] = useState<ChunkMethod>('general_auto');
  const [chunkSize, setChunkSize] = useState<number>(500);
  const [chunkOverlap, setChunkOverlap] = useState<number>(50);
  const [separators, setSeparators] = useState<string>('\\n\\n,\\n,。,.');
  const [parentChunkSize, setParentChunkSize] = useState<number>(2000);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '');
      setDescription(initialData?.description ?? '');
      setChunkMethod(initialData?.chunkMethod ?? 'general_auto');
      setChunkSize(initialData?.chunkSize ?? 500);
      setChunkOverlap(initialData?.chunkOverlap ?? 50);
      setSeparators('\\n\\n,\\n,。,.');
      setParentChunkSize(2000);
      setError('');
    }
  }, [open, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('知识库名称不能为空');
      return;
    }
    if (!isEdit) {
      // 校验数值
      if (chunkSize <= 0) {
        setError('分块大小必须大于 0');
        return;
      }
      if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
        setError('重叠长度必须在 0 到 分块大小 之间');
        return;
      }
    }

    const payload: KbCreatePayload = {
      name: name.trim(),
      description: description.trim(),
    };

    if (!isEdit) {
      payload.chunkMethod = chunkMethod;
      payload.chunkSize = chunkSize;
      payload.chunkOverlap = chunkOverlap;
      if (chunkMethod === 'general_custom') {
        // 用户输入：逗号分隔，支持转义换行 \n / \n\n
        const list = separators
          .split(',')
          .map((s) => s.trim().replace(/\\n/g, '\n').replace(/\\t/g, '\t'))
          .filter((s) => s.length > 0);
        if (list.length === 0) {
          setError('自定义分隔符不能为空');
          return;
        }
        // 末尾追加空串作为兜底
        payload.separators = [...list, ''];
      }
      if (chunkMethod === 'parent_child') {
        if (parentChunkSize <= chunkSize) {
          setError('父块大小必须大于子块大小');
          return;
        }
        payload.parentChunkSize = parentChunkSize;
      }
    }

    onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑知识库' : '新建知识库'}</DialogTitle>
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

            {!isEdit && (
              <>
                <div className="grid gap-2">
                  <Label>分段方式</Label>
                  <div className="grid gap-2">
                    {CHUNK_METHODS.map((m) => (
                      <label
                        key={m.value}
                        className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
                          chunkMethod === m.value
                            ? 'border-accent bg-accent/5'
                            : 'border-border hover:border-border-strong'
                        }`}
                      >
                        <input
                          type="radio"
                          name="chunk-method"
                          value={m.value}
                          checked={chunkMethod === m.value}
                          onChange={() => setChunkMethod(m.value)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-text">{m.label}</div>
                          <div className="text-xs text-text-dim mt-0.5">{m.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="chunk-size">分块大小</Label>
                    <Input
                      id="chunk-size"
                      type="number"
                      min={50}
                      max={4000}
                      value={chunkSize}
                      onChange={(e) => setChunkSize(Number(e.target.value))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="chunk-overlap">重叠长度</Label>
                    <Input
                      id="chunk-overlap"
                      type="number"
                      min={0}
                      max={500}
                      value={chunkOverlap}
                      onChange={(e) => setChunkOverlap(Number(e.target.value))}
                    />
                  </div>
                </div>

                {chunkMethod === 'general_custom' && (
                  <div className="grid gap-2">
                    <Label htmlFor="separators">自定义分隔符（逗号分隔）</Label>
                    <Input
                      id="separators"
                      value={separators}
                      onChange={(e) => setSeparators(e.target.value)}
                      placeholder="\n\n,\n,。,."
                    />
                    <p className="text-2xs text-text-mute">
                      支持 \n（换行）、\t（制表符）。例如：\n\n,\n,。,.
                    </p>
                  </div>
                )}

                {chunkMethod === 'parent_child' && (
                  <div className="grid gap-2">
                    <Label htmlFor="parent-size">父块大小</Label>
                    <Input
                      id="parent-size"
                      type="number"
                      min={500}
                      max={8000}
                      value={parentChunkSize}
                      onChange={(e) => setParentChunkSize(Number(e.target.value))}
                    />
                    <p className="text-2xs text-text-mute">
                      父块用于提供完整上下文，应大于上面的「分块大小」。建议 1500-3000。
                    </p>
                  </div>
                )}
              </>
            )}

            {error && <span className="text-xs text-error">{error}</span>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">{isEdit ? '保存' : '创建'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
