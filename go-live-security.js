(() => {
  'use strict';

  const body = document.body;
  const requiredPermission = body?.dataset.requiredPermission || '';
  if (requiredPermission && body) body.style.visibility = 'hidden';

  function normalizePermissions(value) {
    if (Array.isArray(value)) return value.map(String);
    if (value && typeof value === 'object') return Object.keys(value).filter(k => value[k]);
    return [];
  }

  function can(context, permission) {
    if (!permission) return true;
    const role = String(context?.role || '').toLowerCase();
    if (role === 'owner' || role === 'admin') return true;
    const permissions = normalizePermissions(context?.permissions);
    if (permission === 'hardware.manage') {
      return permissions.includes('hardware.manage') || permissions.includes('user.manage');
    }
    return permissions.includes(permission);
  }

  async function resolveAccess() {
    if (!window.supabaseClient?.auth) {
      throw new Error('Supabase client is not ready');
    }
    const {data: {session}, error: sessionError} = await window.supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      if (requiredPermission) {
        location.replace('./index.html');
        return null;
      }
      return {anonymous: true, role: 'anonymous', permissions: []};
    }
    const {data, error} = await window.supabaseClient.rpc('current_access_context');
    if (error) throw error;
    if (!data?.is_active) throw new Error('บัญชีผู้ใช้งานถูกปิดใช้งาน');
    return data;
  }

  async function apply() {
    try {
      const context = await resolveAccess();
      if (!context) return null;
      document.querySelectorAll('[data-permission]').forEach(node => {
        const allowed = can(context, node.dataset.permission);
        node.hidden = !allowed;
        node.setAttribute('aria-hidden', allowed ? 'false' : 'true');
      });
      if (requiredPermission && !can(context, requiredPermission)) {
        alert('บัญชีนี้ไม่มีสิทธิ์เปิดหน้านี้');
        location.replace(context.landing_page || './dashboard.html');
        return null;
      }
      if (body) body.style.visibility = '';
      window.dispatchEvent(new CustomEvent('tkn-security-ready', {detail: context}));
      return context;
    } catch (error) {
      console.error('Go-live security guard:', error);
      if (body) body.style.visibility = '';
      alert(error?.message || 'ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้งานได้');
      location.replace('./index.html');
      return null;
    }
  }

  window.TKNGoLiveSecurity = Object.freeze({can, resolveAccess});
  window.TKNSecurityReady = apply();
})();
