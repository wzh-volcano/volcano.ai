import React from 'react';
import { IconButton } from '@/components/IconButton';
import { Badge } from '@/components/Badge';
import {
  LayoutTemplate,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LayoutGrid,
  Columns3,
  LayoutList,
} from 'lucide-react';

export const TitleBar: React.FC = () => {
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
        <IconButton icon={<LayoutTemplate size={14} />} title="侧边栏" />
        <IconButton icon={<ChevronLeft size={14} />} title="返回" />
        <IconButton icon={<ChevronRight size={14} />} title="前进" />
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
        <IconButton icon={<LayoutGrid size={14} />} />
        <IconButton icon={<Columns3 size={14} />} />
        <IconButton icon={<LayoutList size={14} />} />
      </div>
    </header>
  );
};
