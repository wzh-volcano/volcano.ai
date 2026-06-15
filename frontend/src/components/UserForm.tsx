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
import { Label } from '@/components/ui/label';
import type { User } from '@/types';

interface UserFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 有值时为编辑模式 */
  editingUser?: User | null;
  onSubmit: (data: { username: string; password: string; role: string }) => void;
}

export const UserForm: React.FC<UserFormProps> = ({
  open,
  onOpenChange,
  editingUser,
  onSubmit,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setUsername(editingUser?.username ?? '');
      setPassword('');
      setRole(editingUser?.role ?? 'user');
      setError('');
    }
  }, [open, editingUser]);

  const isEdit = !!editingUser;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('用户名不能为空');
      return;
    }
    if (!isEdit && !password.trim()) {
      setError('请设置密码（至少 6 位）');
      return;
    }
    if (!isEdit && password.trim().length < 6) {
      setError('密码长度至少 6 位');
      return;
    }
    onSubmit({ username: username.trim(), password: password.trim(), role });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? '编辑用户' : '新增用户'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="user-name">用户名</Label>
              <Input
                id="user-name"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="输入用户名"
                disabled={isEdit}
                autoFocus
              />
            </div>

            {!isEdit && (
              <div className="grid gap-2">
                <Label htmlFor="user-password">密码</Label>
                <Input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="设置密码（至少 6 位）"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="user-role">角色</Label>
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-bg-2 px-3 py-1 text-sm text-text outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>

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
