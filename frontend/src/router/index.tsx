import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '@/App';
import { LoginPage } from '@/pages/Login/LoginPage';
import { RequireAuth } from '@/components/RequireAuth';
import { MainContent } from '@/sections/MainContent/MainContent';
import { KnowledgeBasePage } from '@/pages/KnowledgeBase/KnowledgeBasePage';
import { KnowledgeBaseDetail } from '@/pages/KnowledgeBase/KnowledgeBaseDetail';
import { UserManagementPage } from '@/pages/Users/UserManagementPage';
import { PluginManagementPage } from '@/pages/Plugins/PluginManagementPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <App />,
        children: [
          {
            index: true,
            element: <MainContent />,
          },
          {
            path: 'knowledge-base',
            element: <KnowledgeBasePage />,
          },
          {
            path: 'knowledge-base/:id',
            element: <KnowledgeBaseDetail />,
          },
          {
            path: 'users',
            element: <UserManagementPage />,
          },
          {
            path: 'plugins',
            element: <PluginManagementPage />,
          },
          {
            path: '*',
            element: <Navigate to="/" replace />,
          },
        ],
      },
    ],
  },
]);
