import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import {
  Plus,
  Square,
  Wand2,
  Library,
  LayoutGrid,
  Settings,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const taskGroups = useAppStore((s) => s.taskGroups);
  const setActiveTask = useAppStore((s) => s.setActiveTask);

  const menuItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] transition-colors duration-150 cursor-pointer ${
      isActive
        ? 'bg-bg-active text-text'
        : 'text-text hover:bg-bg-hover'
    }`;

  return (
    <aside className="bg-[#16191d] border-r border-border flex flex-col overflow-hidden">
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
        <a className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-text text-[13px] hover:bg-bg-hover transition-colors cursor-pointer">
          <Wand2 size={16} className="text-text-dim" />
          技能
        </a>
        <NavLink to="/knowledge-base" className={menuItemClass}>
          <Library size={16} className="text-text-dim" />
          知识库
        </NavLink>
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

      {/* 用户信息 */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-t border-border bg-[#14171b]">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-[#b58cff] inline-flex items-center justify-center font-semibold text-xs text-white">
          R
        </div>
        <span className="flex-1 text-[13px]">Ryan Bot</span>
        <Settings size={16} className="text-text-dim cursor-pointer" />
      </div>
    </aside>
  );
};
