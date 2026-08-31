// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import { SchoolFinder } from './SchoolFinder';
import * as api from './api';

const mockProfile = {
  country: 'Mexico',
  institution: 'UNAM',
  degree: 'Bachelor',
  field: 'Computer Science',
  purpose: 'University Admission'
};

const mockT = (key: string) => {
  const map: Record<string, string> = {
    sfTitle: 'University Search (Public Data)',
    sfConfirmCip: 'Confirm Program Category',
    sfFilterNationwide: 'Nationwide',
    sfCip1107: 'Computer Science (1107)',
    sfBtnSearch: 'Search Schools',
    sfNoResults: 'No public institutions matched this program in the selected area.',
    sfSourceNote: 'Data retrieved from official U.S. Department of Education records.',
    sfOutreachConsent: 'I understand this is an informational inquiry only',
    sfBtnContact: 'Send Inquiry',
    sfOutreachTitle: 'Admissions Outreach',
    sfOutreachSent: 'Sent',
    sfOutreachFailed: 'Failed',
    sfOutreachUnattempted: 'Not attempted',
    sfErrSetup: 'The Department of Education integration is not fully configured yet. Please contact the administrator.',
    sfContactUnavailable: 'Contact information could not be verified.',
  };
  return map[key] || key;
};

vi.mock('./components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, id, 'data-testid': testId }: any) => (
    <button
      id={id}
      data-testid={testId}
      onClick={() => onCheckedChange(!checked)}
    >
      {checked ? 'checked' : 'unchecked'}
    </button>
  ),
}));
vi.mock('./components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <div data-testid="mock-select" onClick={() => onValueChange('1107')}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => <span>Value</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ value, children }: any) => <div data-value={value}>{children}</div>,
}));

describe('SchoolFinder', () => {
  beforeEach(() => {
    vi.spyOn(api, 'apiFetchOpportunities').mockResolvedValue([]);
    vi.spyOn(api, 'apiFetchSchoolOutreachHistory').mockResolvedValue([]);
    vi.spyOn(api, 'apiUpsertSchoolOpportunity').mockResolvedValue(undefined);
    vi.spyOn(api, 'apiDeleteSchoolOpportunity').mockResolvedValue(undefined);
  });

  it('displays unavailable contact status correctly', async () => {
    vi.spyOn(api, 'apiFetchOpportunities').mockResolvedValue([
      { id: '1', kind: 'school', title: 'Saved U', organization: 'Saved U', status: 'saved', createdAt: '2026-01-01', updatedAt: '2026-01-01', readinessChecks: [], deadline: null }
    ]);
    
    vi.spyOn(api, 'apiFetchSchoolContacts').mockResolvedValue([
      { schoolId: '1', schoolName: 'Saved U', status: 'unavailable', recipients: [] }
    ]);

    render(<SchoolFinder profile={mockProfile} t={mockT} username="test" />);
    
    await waitFor(() => { expect(screen.getByTestId('section-school-outreach')).not.toBeNull(); });
    
    await act(async () => { fireEvent.click(screen.getByTestId('check-outreach-1')); });
    await act(async () => { fireEvent.click(screen.getByTestId('button-fetch-contacts')); });
    
    await waitFor(() => {
      expect(screen.getByText('Contact information could not be verified.')).not.toBeNull();
    });
  });

  it('rejects malformed API payload with 503 as setup error', async () => {
    const mockSearch = vi.spyOn(api, 'apiSearchSchools').mockRejectedValue(new Error('setup_unavailable'));
    render(<SchoolFinder profile={mockProfile} t={mockT} username="test" />);
    
    const selects = screen.getAllByTestId('mock-select');
    await act(async () => { fireEvent.click(selects[0]); });
    await act(async () => { fireEvent.click(screen.getByTestId('button-search-schools')); });
    
    await waitFor(() => {
      expect(screen.getByText('The Department of Education integration is not fully configured yet. Please contact the administrator.')).not.toBeNull();
    });
  });


  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing if purpose is not University Admission', () => {
    const { container } = render(<SchoolFinder profile={{...mockProfile, purpose: 'Employment & HR'}} t={mockT} username="test" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders correctly for University Admission and explicitly asks for CIP', async () => {
    render(<SchoolFinder profile={mockProfile} t={mockT} username="test" />);
    
    expect(screen.getByTestId('container-schoolfinder')).not.toBeNull();
    expect(screen.getByText('University Search (Public Data)')).not.toBeNull();
    
    // Search button is disabled initially because CIP is empty
    const searchBtn = screen.getByTestId('button-search-schools');
    expect((searchBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('performs search and displays results with source attribution', async () => {
    const mockSearch = vi.spyOn(api, 'apiSearchSchools').mockResolvedValue({
      schools: [
        { 
          id: '1', 
          name: 'State University', 
          city: 'City', 
          state: 'ST', 
          studentSize: 10000, 
          website: 'https://state.edu', 
          priceCalculator: 'https://state.edu/price',
          ownership: 'Public',
          predominantDegree: 'Bachelor',
          highestDegree: 'Graduate',
          onlineOnly: false,
          degreeFields: ['11'],
          matchedCip: '1107'
        }
      ],
      source: { name: 'Dept of Ed', url: 'https://ed.gov', retrievedAt: '2026-01-01T00:00:00Z' }
    });

    render(<SchoolFinder profile={mockProfile} t={mockT} username="test" />);
    
    // Simulate CIP selection
    const selects = screen.getAllByTestId('mock-select');
    await act(async () => {
      fireEvent.click(selects[0]); // Sets CIP to 1107
    });
    
    const searchBtn = screen.getByTestId('button-search-schools');
    expect((searchBtn as HTMLButtonElement).disabled).toBe(false);
    
    await act(async () => {
      fireEvent.click(searchBtn);
    });
    
    expect(mockSearch).toHaveBeenCalledWith('1107', '', '', '', 0);
    
    await waitFor(() => {
      expect(screen.getByTestId('list-search-results')).not.toBeNull();
      expect(screen.getByText('Data retrieved from official U.S. Department of Education records.')).not.toBeNull();
      expect(screen.getByText('State University')).not.toBeNull();
    });
  });

  it('shows empty state when no results', async () => {
    vi.spyOn(api, 'apiSearchSchools').mockResolvedValue({
      schools: [],
      source: { name: 'Dept of Ed', url: 'https://ed.gov', retrievedAt: '2026-01-01T00:00:00Z' }
    });

    render(<SchoolFinder profile={mockProfile} t={mockT} username="test" />);
    
    const selects = screen.getAllByTestId('mock-select');
    await act(async () => { fireEvent.click(selects[0]); });
    
    await act(async () => { fireEvent.click(screen.getByTestId('button-search-schools')); });
    
    await waitFor(() => {
      expect(screen.getByTestId('text-search-empty')).not.toBeNull();
      expect(screen.getByText('No public institutions matched this program in the selected area.')).not.toBeNull();
    });
  });

  it('allows saving a shortlist and displays outreach section', async () => {
    // Pre-seed opportunities
    vi.spyOn(api, 'apiFetchOpportunities').mockResolvedValue([
      { 
        id: '1', 
        kind: 'school', 
        title: 'Saved U', 
        organization: 'Saved U', 
        status: 'saved',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        readinessChecks: [],
        deadline: null
      }
    ]);
    
    render(<SchoolFinder profile={mockProfile} t={mockT} username="test" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('section-school-outreach')).not.toBeNull();
      expect(screen.getByText('Saved U')).not.toBeNull();
    });
  });
  
  it('prevents sending outreach before consent is checked and shows per-recipient results', async () => {
    vi.spyOn(api, 'apiFetchOpportunities').mockResolvedValue([
      { 
        id: '1', 
        kind: 'school', 
        title: 'Saved U', 
        organization: 'Saved U', 
        status: 'saved',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        readinessChecks: [],
        deadline: null
      }
    ]);
    
    vi.spyOn(api, 'apiFetchSchoolContacts').mockResolvedValue([
      { schoolId: '1', schoolName: 'Saved U', status: 'verified', recipients: [{ email: 'admissions@saved.edu', sourceUrl: 'x' }] }
    ]);

    const mockOutreach = vi.spyOn(api, 'apiSendSchoolOutreach').mockResolvedValue([
      { schoolId: '1', result: 'sent' }
    ]);

    render(<SchoolFinder profile={mockProfile} t={mockT} username="test" />);
    
    await waitFor(() => {
      expect(screen.getByTestId('section-school-outreach')).not.toBeNull();
    });
    
    // Select the school for outreach
    await act(async () => {
      const chk = screen.getByTestId('check-outreach-1');
      fireEvent.click(chk);
    });
    
    // Click Preview Outreach
    let fetchBtn: any;
    await waitFor(() => {
      fetchBtn = screen.getByTestId('button-fetch-contacts');
      expect(fetchBtn).not.toBeNull();
    });
    
    await act(async () => {
      fireEvent.click(fetchBtn);
    });
    
    let sendBtn: any;
    await waitFor(() => {
      sendBtn = screen.getByTestId('button-send-outreach');
      expect(sendBtn).not.toBeNull();
    });
    
    expect(sendBtn.disabled).toBe(true); // Consent not checked yet
    
    // Check consent
    await act(async () => {
      const consent = screen.getByTestId('check-outreach-consent');
      fireEvent.click(consent);
    });
    
    expect(sendBtn.disabled).toBe(false);
    
    // Send
    await act(async () => {
      fireEvent.click(sendBtn);
    });
    
    expect(mockOutreach).toHaveBeenCalledWith('test', expect.any(String), [{ schoolId: '1', email: 'admissions@saved.edu' }], true);
    
    await waitFor(() => {
      expect(screen.getByTestId('list-outreach-results')).not.toBeNull();
      expect(screen.getByText('Sent')).not.toBeNull();
    });
  });
});