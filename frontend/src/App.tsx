import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '@/sections/TitleBar/TitleBar';
import { Sidebar } from '@/sections/Sidebar/Sidebar';
import { Rightbar } from '@/sections/Rightbar/Rightbar';
import { useAppStore } from '@/store/useAppStore';
import './App.less';

const App: React.FC = () => {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const rightbarOpen = useAppStore((s) => s.rightbarOpen);

  const cls = [
    'layout',
    sidebarOpen ? '' : 'sidebar-hidden',
    rightbarOpen ? '' : 'rightbar-hidden',
  ].filter(Boolean).join(' ');

  return (
    <div className="app">
      <TitleBar />
      <div className={cls}>
        <Sidebar />
        <Outlet />
        <Rightbar />
      </div>
    </div>
  );
};

export default App;
