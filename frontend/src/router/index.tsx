import { createBrowserRouter } from 'react-router-dom';
import App from '@/App';
import { MainContent } from '@/sections/MainContent/MainContent';
import { KnowledgeBasePage } from '@/pages/KnowledgeBase/KnowledgeBasePage';
import { KnowledgeBaseDetail } from '@/pages/KnowledgeBase/KnowledgeBaseDetail';

export const router = createBrowserRouter([
  {
    path: '/',
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
    ],
  },
]);
