import { api, ApiError } from './apiClient';
import {
  ADMIN_USER_PAGE_SIZE,
  assertUserCountPayload,
  assertUserListPayload,
  buildAdminUserQuery,
} from './usersAdmin';

export async function fetchAdminUsers(filters) {
  const data = await api.get(`/admin/users?${buildAdminUserQuery({
    ...filters,
    pageSize: filters?.pageSize || ADMIN_USER_PAGE_SIZE,
  })}`);
  const problem = assertUserListPayload(data);
  if (problem) throw new ApiError(problem, 500, data);
  return data;
}

export async function fetchAdminUserCount() {
  const data = await api.get('/admin/users/count');
  const problem = assertUserCountPayload(data);
  if (problem) throw new ApiError(problem, 500, data);
  return data.totalUsers;
}

export async function registerAdminUser({ email, password }) {
  const data = await api.post('/admin/users', { email, password });
  const user = data?.user;
  if (!user || typeof user.email !== 'string' || user.password || user.passwordHash || user.password_hash) {
    throw new ApiError('Registration response was incomplete.', 500, data);
  }
  return user;
}
