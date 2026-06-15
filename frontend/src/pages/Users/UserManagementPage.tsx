import React, { useState, useMemo, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/lib/api';
import { UserForm } from '@/components/UserForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Users,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  KeyRound,
  Power,
  PowerOff,
  Loader2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import type { User } from '@/types';

export const UserManagementPage: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 重置密码结果
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [query, setQuery] = useState('');

  // 加载用户列表
  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listUsers();
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // 搜索过滤
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, query]);

  // 新增
  const handleCreate = async (data: { username: string; password: string; role: string }) => {
    setSubmitting(true);
    try {
      await api.createUser(data.username, data.password, data.role);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 编辑
  const handleEdit = async (data: { username: string; password: string; role: string }) => {
    if (!editingUser) return;
    setSubmitting(true);
    try {
      await api.updateUser(editingUser.id, { role: data.role });
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '编辑失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  // 重置密码
  const handleResetPassword = async (user: User) => {
    try {
      const newPwd = await api.resetUserPassword(user.id);
      setResetResult({ username: user.username, password: newPwd });
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '重置失败');
    }
  };

  // 启用/禁用
  const handleToggleStatus = async (user: User) => {
    try {
      const updated = await api.toggleUserStatus(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  };

  // 复制临时密码
  const copyPassword = () => {
    if (!resetResult) return;
    navigator.clipboard.writeText(resetResult.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openCreate = () => {
    setEditingUser(null);
    setFormOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormOpen(true);
  };

  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin) {
    return (
      <main className="flex flex-col items-center justify-center h-full bg-bg">
        <AlertCircle size={40} className="text-warning mb-3" />
        <p className="text-sm text-text-dim">需要管理员权限才能访问用户管理</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-text-dim" />
          <h2 className="text-base font-medium text-text">用户管理</h2>
          <span className="text-xs text-text-mute ml-2">{filtered.length} 个用户</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索用户..."
              className="pl-8 w-56 h-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5" disabled={submitting}>
            <Plus size={14} />
            新增用户
          </Button>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Loader2 size={28} className="animate-spin text-text-mute" />
            <p className="text-sm">加载用户列表...</p>
          </div>
        ) : error && users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <AlertCircle size={28} className="text-warning" />
            <p className="text-sm">加载失败：{error}</p>
            <Button variant="ghost" size="sm" onClick={loadUsers}>重试</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Users size={40} className="text-text-mute opacity-50" />
            <p className="text-sm">{query ? '未找到匹配的用户' : '暂无用户'}</p>
            {!query && (
              <Button variant="ghost" size="sm" onClick={openCreate}>创建第一个用户</Button>
            )}
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-warning/10 text-warning text-xs">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-2">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">用户名</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">角色</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">状态</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">创建时间</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-text-dim">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border last:border-b-0 hover:bg-bg-hover transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-bg-3 border border-border inline-flex items-center justify-center text-xs font-medium text-text-dim">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-text">{user.username}</span>
                          {user.id === currentUser?.id && (
                            <span className="text-2xs text-text-mute">(当前)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium ${
                            user.role === 'admin'
                              ? 'bg-accent/15 text-accent'
                              : 'bg-bg-3 text-text-dim border border-border'
                          }`}
                        >
                          {user.role === 'admin' ? '管理员' : '普通用户'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-medium ${
                            user.status === 'active'
                              ? 'bg-success/15 text-success'
                              : 'bg-error/15 text-error'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            user.status === 'active' ? 'bg-success' : 'bg-error'
                          }`} />
                          {user.status === 'active' ? '正常' : '已禁用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-dim text-xs">{user.createdAt}</td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => openEdit(user)}>
                              <Pencil size={14} />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                              <KeyRound size={14} />
                              重置密码
                            </DropdownMenuItem>
                            {user.status === 'active' ? (
                              <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                                <PowerOff size={14} />
                                禁用
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                                <Power size={14} />
                                启用
                              </DropdownMenuItem>
                            )}
                            {user.id !== currentUser?.id && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeleteTarget(user)}
                                  className="text-error focus:text-error"
                                >
                                  <Trash2 size={14} />
                                  删除
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editingUser={editingUser}
        onSubmit={editingUser ? handleEdit : handleCreate}
      />

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除用户 <span className="text-text font-medium">{deleteTarget?.username}</span> 吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置密码结果弹窗 */}
      <Dialog open={!!resetResult} onOpenChange={(open) => !open && setResetResult(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>密码已重置</DialogTitle>
            <DialogDescription>
              用户 <span className="text-text font-medium">{resetResult?.username}</span> 的新密码：
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-bg-3 border border-border">
            <code className="flex-1 text-sm font-mono text-accent">{resetResult?.password}</code>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={copyPassword}>
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            </Button>
          </div>
          <p className="text-2xs text-text-mute">请将此密码告知用户，用户可用其登录后自行修改。</p>
          <DialogFooter>
            <Button onClick={() => setResetResult(null)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
