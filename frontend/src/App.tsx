import React from 'react';
import { Outlet } from 'react-router-dom';
import { TitleBar } from '@/sections/TitleBar/TitleBar';
import { Sidebar } from '@/sections/Sidebar/Sidebar';
import { Rightbar } from '@/sections/Rightbar/Rightbar';
import './App.less';

const App: React.FC = () => {
  return (
    <div className="app">
      <TitleBar />
      <div className="layout">
        <Sidebar />
        <Outlet />
        <Rightbar />
      </div>
    </div>
  );
};

export default App;
