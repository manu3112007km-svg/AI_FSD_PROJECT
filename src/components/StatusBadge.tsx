import React from 'react';

const PRIORITY_STYLES: Record<string, string> = {
  Critical: 'bg-[#FDECEC] text-[#7F1D1D] border-[#B91C1C]',
  High: 'bg-[#FEF3C7] text-[#78350F] border-[#B45309]',
  Medium: 'bg-[#F7E7A1] text-[#493713] border-[#C9A227]',
  Low: 'bg-[#ECFDF5] text-[#14532D] border-[#15803D]',
};

const STATUS_STYLES: Record<string, string> = {
  Reported: 'bg-[#FFF2C6] text-[#493713] border-[#C9A227]',
  'Under Verification': 'bg-[#FEF3C7] text-[#78350F] border-[#B45309]',
  Verified: 'bg-[#E0F2FE] text-[#0C4A6E] border-[#0369A1]',
  'Resource Assignment Pending': 'bg-[#FEF3C7] text-[#78350F] border-[#B45309]',
  Assigned: 'bg-[#F7E7A1] text-[#493713] border-[#8A6D1B]',
  'Response in Progress': 'bg-[#FFEDD5] text-[#7C2D12] border-[#C2410C]',
  'Assistance Provided': 'bg-[#ECFDF5] text-[#14532D] border-[#15803D]',
  Resolved: 'bg-[#DCFCE7] text-[#14532D] border-[#16A34A]',
  Closed: 'bg-[#F3F4F6] text-[#374151] border-[#9CA3AF]',
  Available: 'bg-[#DCFCE7] text-[#14532D] border-[#16A34A]',
  'In Service': 'bg-[#F7E7A1] text-[#493713] border-[#C9A227]',
  'Under Maintenance': 'bg-[#FEF3C7] text-[#78350F] border-[#B45309]',
  Unavailable: 'bg-[#FDECEC] text-[#7F1D1D] border-[#B91C1C]',
  Operational: 'bg-[#DCFCE7] text-[#14532D] border-[#16A34A]',
  'High Load': 'bg-[#FEF3C7] text-[#78350F] border-[#B45309]',
  'Limited Triage': 'bg-[#FDECEC] text-[#7F1D1D] border-[#B91C1C]',
  APPROVED: 'bg-[#DCFCE7] text-[#14532D] border-[#16A34A]',
  PENDING: 'bg-[#FEF3C7] text-[#78350F] border-[#B45309]',
  SUSPENDED: 'bg-[#FDECEC] text-[#7F1D1D] border-[#B91C1C]',
};

export function PriorityIndicator({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority] || 'bg-[#FFFDF5] text-[#29251C] border-[#C9A227]';
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-bold ${cls}`}
    >
      {priority} Priority
    </span>
  );
}

export function StatusIndicator({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] || 'bg-[#FFFDF5] text-[#29251C] border-[#C0C0C0]';
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-bold ${cls}`}
    >
      {status}
    </span>
  );
}
