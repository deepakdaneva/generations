import { recordResetLink, resetLinksLeft } from './reset-limit';

describe('reset link daily limit', () => {
  beforeEach(() => localStorage.clear());

  it('allows 2 links per email per day, case-insensitively', () => {
    expect(resetLinksLeft('Ann@Example.test')).toBe(2);
    recordResetLink('ann@example.test');
    expect(resetLinksLeft('ANN@example.test')).toBe(1);
    recordResetLink('ann@example.test');
    expect(resetLinksLeft('ann@example.test')).toBe(0);
    expect(resetLinksLeft('bob@example.test')).toBe(2);
  });

  it('starts again on a new day', () => {
    localStorage.setItem(
      'generations.resetLinks',
      JSON.stringify({ day: '2000-01-01', counts: { 'ann@example.test': 2 } }),
    );
    expect(resetLinksLeft('ann@example.test')).toBe(2);
  });
});
