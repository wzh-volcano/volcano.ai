import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
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
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Square,
  Wand2,
  Library,
  LayoutGrid,
  Users,
  Puzzle,
  LogOut,
  KeyRound,
  ChevronUp,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const taskGroups = useAppStore((s) => s.taskGroups);
  const setActiveTask = useAppStore((s) => s.setActiveTask);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);

  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const menuItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] transition-colors duration-150 cursor-pointer ${
      isActive
        ? 'bg-bg-active text-text'
        : 'text-text hover:bg-bg-hover'
    }`;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPwd || !newPwd) {
      setPwdError('请填写原密码和新密码');
      return;
    }
    if (newPwd.length < 6) {
      setPwdError('新密码长度至少 6 位');
      return;
    }
    setPwdSubmitting(true);
    setPwdError('');
    try {
      const { api } = await import('@/lib/api');
      await api.changePassword(oldPwd, newPwd);
      setChangePwdOpen(false);
      setOldPwd('');
      setNewPwd('');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : '修改失败');
    } finally {
      setPwdSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <aside className="bg-bg-2 border-r border-border flex flex-col overflow-hidden">
      {/* 顶部菜单 */}
      <nav className="px-2 pt-2.5 pb-1">
        <NavLink to="/" className={menuItemClass} end>
          <Plus size={16} className="text-text-dim" />
          新建任务
          <span className="ml-auto text-text-mute text-2xs">⌘N</span>
        </NavLink>
        <a className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-text text-[13px] hover:bg-bg-hover transition-colors cursor-pointer">
          <Square size={16} className="text-text-dim" />
          打开工作区
        </a>
        <NavLink to="/skills" className={menuItemClass}>
          <Wand2 size={16} className="text-text-dim" />
          技能
        </NavLink>
        <NavLink to="/knowledge-base" className={menuItemClass}>
          <Library size={16} className="text-text-dim" />
          知识库
        </NavLink>
        <NavLink to="/studio" className={menuItemClass}>
          <LayoutGrid size={16} className="text-text-dim" />
          工作室
        </NavLink>
        {isAdmin && (
          <NavLink to="/users" className={menuItemClass}>
            <Users size={16} className="text-text-dim" />
            用户管理
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/plugins" className={menuItemClass}>
            <Puzzle size={16} className="text-text-dim" />
            插件管理
          </NavLink>
        )}
      </nav>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex justify-between items-center px-2.5 pt-2.5 pb-1.5 text-xs text-text-dim">
          <span>任务</span>
          <LayoutGrid size={14} className="text-text-mute cursor-pointer" />
        </div>

        {taskGroups.map((group, gi) => (
          <div key={group.title} className="mb-1">
            <div className="px-2.5 pt-2 pb-1 text-xs text-text-dim font-medium">
              {group.title}
            </div>
            {group.tasks.map((task, ti) => (
              <a
                key={task.id}
                onClick={() => setActiveTask(gi, ti)}
                className={`
                  flex items-center gap-2 px-2.5 py-[7px] rounded-md
                  text-xs text-text cursor-pointer
                  transition-colors duration-150
                  ${task.active ? 'bg-bg-active' : 'hover:bg-bg-hover'}
                `}
              >
                <span
                  className={`
                    w-1.5 h-1.5 rounded-full shrink-0
                    ${task.active ? 'bg-accent shadow-[0_0_6px_var(--accent)]' : 'bg-text-mute'}
                  `}
                />
                <span className="flex-1 truncate">{task.text}</span>
                <span className="text-text-mute text-2xs shrink-0">{task.time}</span>
              </a>
            ))}
          </div>
        ))}
      </div>

      {/* 用户信息（可点击弹出下拉菜单） */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 px-3.5 py-2.5 border-t border-border bg-bg-2 w-full text-left hover:bg-bg-hover transition-colors">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-[#b58cff] inline-flex items-center justify-center font-semibold text-xs text-white shrink-0">
              {currentUser?.username?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <span className="flex-1 text-[13px] text-text truncate">
              {currentUser?.username ?? '未知用户'}
            </span>
            <ChevronUp size={14} className="text-text-dim shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={4} className="w-48 mb-2">
          <DropdownMenuLabel className="text-text-dim">
            {currentUser?.role === 'admin' ? '管理员' : '普通用户'}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setChangePwdOpen(true)}>
            <KeyRound size={14} />
            修改密码
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-error focus:text-error">
            <LogOut size={14} />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 修改密码弹窗 */}
      <Dialog open={changePwdOpen} onOpenChange={setChangePwdOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <form onSubmit={handleChangePassword}>
            <DialogHeader>
              <DialogTitle>修改密码</DialogTitle>
              <DialogDescription>修改当前账号的登录密码</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="old-pwd">原密码</Label>
                <Input
                  id="old-pwd"
                  type="password"
                  value={oldPwd}
                  onChange={(e) => { setOldPwd(e.target.value); setPwdError(''); }}
                  placeholder="输入原密码"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-pwd">新密码</Label>
                <Input
                  id="new-pwd"
                  type="password"
                  value={newPwd}
                  onChange={(e) => { setNewPwd(e.target.value); setPwdError(''); }}
                  placeholder="输入新密码（至少 6 位）"
                />
              </div>
              {pwdError && (
                <div className="flex items-center gap-2 text-xs text-error">
                  <AlertCircle size={14} />
                  <span>{pwdError}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setChangePwdOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pwdSubmitting}>
                {pwdSubmitting && <Loader2 size={14} className="animate-spin" />}
                确认修改
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
};
