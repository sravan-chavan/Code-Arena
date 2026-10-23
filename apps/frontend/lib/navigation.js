const ADMIN_USERS_PATH = '/admin/users';

const adminNav = [
  { name: 'Dashboard', href: '/admin' },
  { name: 'Contests', href: '/admin/contests' },
  { name: 'Question Bank', href: '/admin/questions' },
  { name: 'Practice Arena', href: '/admin/practice' },
  { name: 'Users', href: ADMIN_USERS_PATH },
  { name: 'System Monitor', href: '/admin/monitor' },
  { name: 'Settings', href: '/admin/settings' },
];

const studentNav = [
  { name: 'Overview', href: '/client' },
  { name: 'Contests', href: '/client/contests' },
  { name: 'Practice Area', href: '/client/practice' },
  { name: 'Submissions', href: '/client/submissions' },
];

function exposesAdminUserManagement(links) {
  return (links || []).some((link) => {
    const href = String(link?.href || '');
    return href === ADMIN_USERS_PATH || href === '/admin' || href.startsWith('/admin/');
  });
}

module.exports = {
  ADMIN_USERS_PATH,
  adminNav,
  studentNav,
  exposesAdminUserManagement,
};
