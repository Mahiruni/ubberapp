import { describe, expect, it } from 'vitest';
import { receiptPaymentState } from '../../lib/biloo-receipt-payment';
describe('receipt cash collection and gateway settlement', () => {
  it.each(['pending','failed','unknown'] as const)('keeps legacy cash %s neutral without claiming collection', status => {
    expect(receiptPaymentState({ status, method: ' Cash ' })).toBe('cash');
  });
  it('shows paid cash only after the backend records it', () => {
    expect(receiptPaymentState({ status: 'paid', method: 'cash' })).toBe('paid');
  });
  it.each(['pending','failed','unknown','paid'] as const)('preserves genuine electronic payment state %s', status => {
    expect(receiptPaymentState({ status, method: 'Chapa' })).toBe(status);
  });
});
