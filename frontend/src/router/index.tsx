import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '@/App';
import { LoginPage } from '@/pages/Login/LoginPage';
import { HomePage } from '@/pages/Home/HomePage';
import { RequireAuth } from '@/components/RequireAuth';
import { KnowledgeBasePage } from '@/pages/KnowledgeBase/KnowledgeBasePage';
import { KnowledgeBaseDetail } from '@/pages/KnowledgeBase/KnowledgeBaseDetail';
import { UserManagementPage } from '@/pages/Users/UserManagementPage';
import { PluginManagementPage } from '@/pages/Plugins/PluginManagementPage';
import { StudioPage } from '@/pages/Studio/StudioPage';
import { AppConfigPage } from '@/pages/Studio/AppConfigPage';
import { ApiKeysPage } from '@/pages/ApiKeys/ApiKeysPage';

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
            element: <HomePage />,
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
            path: 'studio',
            element: <StudioPage />,
          },
          {
            path: 'studio/:id',
            element: <AppConfigPage />,
          },
          {
            path: 'api-keys',
            element: <ApiKeysPage />,
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
