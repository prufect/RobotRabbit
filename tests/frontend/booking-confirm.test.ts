import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarUrl } from '../../frontend/components/BookingConfirm.js';

describe('booking confirmation calendar action', () => {
  it('builds a Google Calendar template URL for the booked repair window', () => {
    const url = new URL(buildGoogleCalendarUrl({
      contractor: { name: 'Bay Area Climate Pros' },
      negotiatedPrice: 145,
      date: 'Today',
      time: '4:00 PM',
      agentNote: 'License verified.',
    }, {
      now: new Date(2026, 5, 6, 9, 0, 0),
      durationMinutes: 90,
      timeZone: 'America/Los_Angeles',
    }));

    expect(`${url.origin}${url.pathname}`).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('RobotRabbit repair with Bay Area Climate Pros');
    expect(url.searchParams.get('dates')).toBe('20260606T160000/20260606T173000');
    expect(url.searchParams.get('ctz')).toBe('America/Los_Angeles');
    expect(url.searchParams.get('details')).toContain('Booked through RobotRabbit.');
    expect(url.searchParams.get('details')).toContain('Price: $145');
    expect(url.searchParams.get('details')).toContain('License verified.');
  });

  it('renders an Add to Google Calendar action on the booking card', () => {
    const source = readFileSync('frontend/components/BookingConfirm.js', 'utf8');

    expect(source).toContain('id="booking-calendar-link"');
    expect(source).toContain('Add to Google Calendar');
    expect(source).toContain('buildGoogleCalendarUrl(booking');
  });
});
