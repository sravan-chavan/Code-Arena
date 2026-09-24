import { getStatusBadgeClass, getStatusLabel } from '@/lib/mockData';

export default function Badge({ status, customLabel, customClass = '' }) {
  const defaultClass = status ? getStatusBadgeClass(status) : '';
  const label = customLabel || (status ? getStatusLabel(status) : '');
  
  return (
    <span className={`badge ${defaultClass} ${customClass}`}>
      <span className="badge-dot"></span>
      {label}
    </span>
  );
}
