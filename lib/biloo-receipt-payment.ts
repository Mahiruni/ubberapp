import type { TripSnapshot } from './nexride-trip-data';

/** Cash collection and gateway settlement have different receipt states. */
export function receiptPaymentState(payment: TripSnapshot['payment']) {
  if (payment.status === 'paid') return 'paid';
  // A legacy cash record is neither proof of collection nor an online failure.
  if (payment.method?.trim().toLowerCase() === 'cash') return 'cash';
  return payment.status;
}
