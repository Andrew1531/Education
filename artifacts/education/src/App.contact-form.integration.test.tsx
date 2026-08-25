// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { USERS_KEY } from './userStore';

const CONTACT_ENDPOINT = 'https://api.web3forms.com/submit';
const VALID_USER = {
  username: 'contacttester',
  email: 'contacttester@example.com',
  password: 'a'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
};

function seedLoggedInUser() {
  localStorage.setItem(USERS_KEY, JSON.stringify([VALID_USER]));
  localStorage.setItem('ge_username', VALID_USER.username);
}

function mockFetch(contactResponse: { ok: boolean; success: boolean }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input) === CONTACT_ENDPOINT) {
      return new Response(
        JSON.stringify({ success: contactResponse.success }),
        {
          status: contactResponse.ok ? 200 : 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return new Response('', { status: 503 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderContactForm() {
  seedLoggedInUser();
  await act(async () => { render(<App />); });
  await waitFor(() => expect(screen.queryByTestId('form-contact')).not.toBeNull());
}

async function submitContactForm() {
  fireEvent.change(screen.getByTestId('input-contact-name'), { target: { value: 'Andrew Tester' } });
  fireEvent.change(screen.getByTestId('input-contact-email'), { target: { value: 'andrew@example.com' } });
  fireEvent.change(screen.getByTestId('input-contact-message'), { target: { value: 'This is a contact form test.' } });
  await act(async () => { fireEvent.submit(screen.getByTestId('form-contact')); });
}

describe('Contact form — Web3Forms submission', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the English confirmation only after Web3Forms accepts the message', async () => {
    const fetchMock = mockFetch({ ok: true, success: true });
    await renderContactForm();
    await submitContactForm();

    await waitFor(() => {
      expect(screen.queryByText('Message Sent Successfully')).not.toBeNull();
    });

    const contactCall = fetchMock.mock.calls.find(([input]) => String(input) === CONTACT_ENDPOINT);
    expect(contactCall).toBeDefined();
    const body = contactCall?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('name')).toBe('Andrew Tester');
    expect((body as FormData).get('email')).toBe('andrew@example.com');
    expect((body as FormData).get('message')).toBe('This is a contact form test.');
    expect((body as FormData).get('access_key')).toBeTruthy();
  });

  it('shows the Spanish confirmation when Spanish is active', async () => {
    mockFetch({ ok: true, success: true });
    await renderContactForm();
    fireEvent.click(screen.getAllByTestId('button-lang-toggle')[0]);
    await submitContactForm();

    await waitFor(() => {
      expect(screen.queryByText('Mensaje Enviado Correctamente')).not.toBeNull();
    });
    expect(screen.queryByText('Gracias por escribirnos. Te responderemos en 24 horas.')).not.toBeNull();
  });

  it('keeps the form visible and translates a rejected submission error', async () => {
    mockFetch({ ok: false, success: false });
    await renderContactForm();
    await submitContactForm();

    await waitFor(() => {
      expect(screen.queryByText("We couldn't send your message. Please try again.")).not.toBeNull();
    });
    expect(screen.queryByTestId('form-contact')).not.toBeNull();

    fireEvent.click(screen.getAllByTestId('button-lang-toggle')[0]);
    await waitFor(() => {
      expect(screen.queryByText('No pudimos enviar tu mensaje. Inténtalo de nuevo.')).not.toBeNull();
    });
  });
});