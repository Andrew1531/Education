// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as api from '../api';
import { ProgramOutreach } from './ProgramOutreach';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const history: api.OutreachHistoryItem = {
  schoolId: '123', schoolName: 'School', recipient: 'admissions@example.edu',
  result: 'sent', providerMessageId: 'message', sentAt: '2026-01-01T00:00:00Z',
  deliveryUpdatedAt: '2026-01-02T00:00:00Z',
};
describe('delivery history', () => {
  it.each([false, true])('shows delivery separately from original acceptance in Spanish=%s', async es => {
    vi.spyOn(api, 'apiFetchSchoolOutreachHistory').mockResolvedValue([
      { ...history, deliveryStatus: 'delivered' },
      { ...history, schoolId: '456', deliveryStatus: 'bounced' },
    ]);
    const send = vi.spyOn(api, 'apiSendReviewedSchoolOutreach');
    render(<ProgramOutreach username="owner" items={[]} remote busy={false} profileKey="" es={es} remove={() => {}} />);
    await screen.findByText(es ? /Entregado al servidor/ : /Delivered to the recipient/);
    expect(screen.getByText(es ? /Rebotado/ : /Bounced/)).toBeTruthy();
    expect(screen.getAllByText(es ? /Resultado original del envío/ : /Original send outcome/)).toHaveLength(2);
    expect(screen.getByText(es ? /La entrega no es una respuesta/ : /Delivery is not a school response/)).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });
  it('refreshes delivery while mounted and clears history on account changes without sending', async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(api, 'apiFetchSchoolOutreachHistory')
      .mockResolvedValueOnce([history])
      .mockResolvedValueOnce([{ ...history, deliveryStatus: 'delivered' }])
      .mockResolvedValue([]);
    const send = vi.spyOn(api, 'apiSendReviewedSchoolOutreach');
    const props = { username: 'owner', items: [], remote: true, busy: false, profileKey: '', es: false, remove: () => {} };
    const view = render(<ProgramOutreach {...props} />);
    await act(async () => {});
    expect(screen.getByText(/delivery not confirmed/)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByText(/Delivered to the recipient/)).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
    view.rerender(<ProgramOutreach {...props} username="other" />);
    await act(async () => {});
    expect(screen.queryByText(/Delivered to the recipient/)).toBeNull();
    expect(send).not.toHaveBeenCalled();
    view.unmount();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('keeps unknown history honest without claiming delivery', async () => {
    vi.spyOn(api, 'apiFetchSchoolOutreachHistory').mockResolvedValue([{ ...history, result: 'unknown', providerMessageId: null }]);
    render(<ProgramOutreach username="owner" items={[]} remote busy={false} profileKey="" es={false} remove={() => {}} />);
    await screen.findByText(/Outcome unknown/);
    fireEvent.click(screen.getByText('Outreach history'));
    expect(screen.queryByText(/Delivered to the recipient/)).toBeNull();
  });
});
