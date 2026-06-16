import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '@/components/IconButton';
import { Badge } from '@/components/Badge';
import {
  LayoutTemplate,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Sun,
  Moon,
  LayoutGrid,
  PanelRightClose,
  LayoutList,
} from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';

export const TitleBar: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggle } = useThemeStore();
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleRightbar = useAppStore((s) => s.toggleRightbar);
  const rightbarOpen = useAppStore((s) => s.rightbarOpen);

  return (
    <header className="flex items-center h-11 px-3 bg-bg border-b border-border gap-3 shrink-0">
      {/* 交通灯 */}
      <div className="flex gap-2">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
      </div>

      {/* 导航按钮 */}
      <div className="flex gap-1 ml-1.5">
        <IconButton icon={<LayoutTemplate size={14} />} title="侧边栏" onClick={toggleSidebar} />
        <IconButton icon={<ChevronLeft size={14} />} title="返回" onClick={() => navigate(-1)} />
        <IconButton icon={<ChevronRight size={14} />} title="前进" onClick={() => navigate(1)} />
      </div>

      {/* 标题区 */}
      <div className="flex-1 flex items-center justify-center gap-2.5 min-w-0">
        <span className="text-text truncate whitespace-nowrap max-w-[420px]">
          创建一个智能五子棋游戏，让玩家与能够进行策略性落子并...
        </span>
        <Badge icon={<span className="text-xs">📁</span>} text="gomoku-ai" />
        <Badge icon={<span className="text-xs">⎇</span>} text="upgrade/v3.0 ▾" variant="branch" />
        <span className="text-text-dim px-1.5 cursor-pointer">···</span>
      </div>

      {/* 右侧操作 */}
      <div className="flex gap-1">
        <IconButton
          icon={
            <span className="flex items-center gap-1">
              <Sparkles size={14} className="text-[#b58cff]" />
              <span className="text-[10px]">▾</span>
            </span>
          }
          title="AI"
        />
        <IconButton
          icon={theme === 'light' ? <Sun size={14} /> : <Moon size={14} />}
          title={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
          onClick={toggle}
        />
        <IconButton icon={<LayoutGrid size={14} />} />
        <IconButton icon={<PanelRightClose size={14} />} title={rightbarOpen ? '隐藏右侧面板' : '显示右侧面板'} onClick={toggleRightbar} />
        <IconButton icon={<LayoutList size={14} />} />
      </div>
    </header>
  );
};
