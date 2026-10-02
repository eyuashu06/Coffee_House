import React from 'react';

interface OrderTrackerProps {
  status: string;
}

const STATUS_STAGES = [
  { key: 'PENDING_PAYMENT', label: 'Payment', icon: 'payments' },
  { key: 'PLACED', label: 'Placed', icon: 'receipt_long' },
  { key: 'PREPARING', label: 'Preparing', icon: 'coffee_maker' },
  { key: 'READY', label: 'Ready', icon: 'check_circle' },
  { key: 'OUT_FOR_DELIVERY', label: 'Delivery', icon: 'local_shipping' },
  { key: 'COMPLETED', label: 'Completed', icon: 'done_all' },
];

export default function OrderTracker({ status }: OrderTrackerProps) {
  // If order is cancelled, rejected, or failed, we just show a failed state
  if (['CANCELLED', 'REJECTED', 'FAILED'].includes(status)) {
    return (
      <div className="flex items-center gap-2 p-3 mt-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
        <span className="material-symbols-outlined">cancel</span>
        Order was {status.toLowerCase()}.
      </div>
    );
  }

  // Find the index of the current status
  // Some statuses map to the same stage conceptually, but let's assume linear progression
  let currentIndex = STATUS_STAGES.findIndex(s => s.key === status);
  if (currentIndex === -1) {
    // If unpaid
    if (status === 'UNPAID') currentIndex = 0;
    else currentIndex = 1; // Default to placed if unknown
  }

  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <h4 className="text-xs font-semibold text-on-surface-variant mb-4 uppercase tracking-wider">Order Status Timeline</h4>
      <div className="relative flex items-center justify-between">
        {/* Connecting Line background */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-surface-container rounded-full z-0"></div>
        {/* Connecting Line active */}
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-tertiary rounded-full z-0 transition-all duration-500"
          style={{ width: `${(currentIndex / (STATUS_STAGES.length - 1)) * 100}%` }}
        ></div>

        {STATUS_STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isPending = idx > currentIndex;

          return (
            <div key={stage.key} className="relative z-10 flex flex-col items-center gap-2 w-12">
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted 
                    ? 'bg-tertiary text-on-tertiary border-2 border-tertiary' 
                    : isCurrent 
                      ? 'bg-primary-container text-tertiary border-2 border-tertiary shadow-[0_0_10px_rgba(251,187,80,0.5)]'
                      : 'bg-surface-container text-on-surface-variant border-2 border-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{stage.icon}</span>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider text-center ${
                isCompleted || isCurrent ? 'text-tertiary' : 'text-on-surface-variant'
              }`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
