export async function loadAccessContext(client) {
  const { data, error } = await client.rpc('current_access_context');
  if (error) throw error;
  if (!data?.user_id || data.is_active !== true) {
    await client.auth.signOut();
    return null;
  }
  sessionStorage.setItem('tkn_user_role', data.role);
  sessionStorage.setItem(
    'tkn_permissions',
    JSON.stringify(data.permissions || [])
  );
  return data;
}

export function hasPermission(context, permission) {
  return Array.isArray(context?.permissions)
    && context.permissions.includes(permission);
}

export function guardPage(context, permission) {
  if (!context) {
    location.replace('./index.html');
    return false;
  }
  if (permission && !hasPermission(context, permission)) {
    location.replace(context.landing_page || './pos.html');
    return false;
  }
  return true;
}

export function applyPermissionElements(context, root=document) {
  root.querySelectorAll('[data-permission]').forEach(element => {
    const allowed = hasPermission(
      context,
      element.getAttribute('data-permission')
    );
    element.hidden = !allowed;
    if ('disabled' in element) element.disabled = !allowed;
  });
}
