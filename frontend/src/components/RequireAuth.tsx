import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * 路由守卫：未登录跳 /login，已登录渲染子路由。
 * 放在需要登录的路由层级上。
 */
export const RequireAuth: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);
  const token = useAuthStore((s) => s.token);
  const restore = useAuthStore((s) => s.restore);
  const location = useLocation();

  useEffect(() => {
    // 首次加载时如果有 token 但还没拿到 user，尝试 restore
    if (token && !currentUser) {
      restore();
    }
  }, [token, currentUser, restore]);

  // 有 token 且有 user → 放行
  if (token && currentUser) {
    return <Outlet />;
  }

  // 有 token 但还在 restore 中 → 显示空（避免闪烁）
  if (token && !currentUser) {
    return null;
  }

  // 无 token → 跳登录，记录来源
  return <Navigate to="/login" state={{ from: location.pathname }} replace />;
};
