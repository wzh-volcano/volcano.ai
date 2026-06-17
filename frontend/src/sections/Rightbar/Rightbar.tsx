import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { Panel } from '@/components/Panel';
import { ConversationList } from './ConversationList';
import { Check } from 'lucide-react';

const GitPanel: React.FC = () => {
  const gitChanges = useAppStore((s) => s.gitChanges);
  return (
    <Panel>
      <h3 className="text-[13px] font-medium text-text mb-3">Git tools</h3>
      {gitChanges.map((change, i) => (
        <div key={i} className="flex justify-between items-center py-1.5 text-[13px] text-text hover:text-white transition-colors cursor-pointer">
          <span className="flex items-center gap-1.5">
            {i === 0 && <span className="text-xs">📋</span>}
            {i === 1 && <span className="text-xs">⎇</span>}
            {i === 2 && <span className="text-xs">⤴</span>}
            {change.label}
            {i === 1 && <span className="text-[10px] text-text-mute ml-1">▾</span>}
          </span>
          {change.add !== undefined && change.del !== undefined && (
            <span className="flex gap-2 text-xs">
              <span className="text-success">+{change.add}</span>
              <span className="text-error">-{change.del}</span>
            </span>
          )}
          {i === 2 && <span className="text-text-mute">···</span>}
        </div>
      ))}
    </Panel>
  );
};

const GoalPanel: React.FC = () => {
  const goalTitle = useAppStore((s) => s.goalTitle);
  const goalMeta = useAppStore((s) => s.goalMeta);
  const goalStatus = useAppStore((s) => s.goalStatus);
  return (
    <Panel>
      <div className="flex justify-between items-center mb-2.5">
        <h3 className="text-[13px] font-medium text-text">Goal</h3>
        <span className="text-2xs text-success bg-success/10 px-2 py-0.5 rounded-full">{goalStatus}</span>
      </div>
      <div className="text-[13px] text-text leading-relaxed">⊙ {goalTitle}</div>
      <div className="text-[11.5px] text-text-mute mt-1.5">{goalMeta}</div>
    </Panel>
  );
};

const ProgressPanel: React.FC = () => {
  const progressItems = useAppStore((s) => s.progressItems);
  return (
    <Panel>
      <h3 className="text-[13px] font-medium text-text mb-3">Progress</h3>
      <ul className="list-none">
        {progressItems.map((item, i) => (
          <li key={i} className="flex gap-2 py-1 text-[13px] text-text-dim leading-relaxed">
            <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-success text-success text-[10px] shrink-0 mt-0.5">
              <Check size={10} />
            </span>
            {item.text}
          </li>
        ))}
      </ul>
    </Panel>
  );
};

export const Rightbar: React.FC = () => {
  const location = useLocation();
  const isStudioPage = location.pathname.startsWith('/studio/');

  return (
    <aside className="bg-bg-2 border-l border-border p-3.5 overflow-y-auto flex flex-col gap-3.5">
      {isStudioPage ? (
        <Panel>
          <ConversationList />
        </Panel>
      ) : (
        <>
          <GitPanel />
          <GoalPanel />
          <ProgressPanel />
        </>
      )}
    </aside>
  );
};
