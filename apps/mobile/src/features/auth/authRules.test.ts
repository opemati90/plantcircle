import { deriveDisplayName, safeNextPath } from './authRules';

describe('deriveDisplayName', () => {
  it('uses first name and last initial from the identity provider', () => {
    expect(deriveDisplayName({ providerName: 'Ama Owusu', email: null })).toBe('Ama O.');
    expect(deriveDisplayName({ providerName: 'Lena Maria Schmidt', email: null })).toBe(
      'Lena S.',
    );
    expect(deriveDisplayName({ providerName: ' Lena ', email: null })).toBe('Lena');
  });

  it('exposes only the leading word of an email address', () => {
    expect(deriveDisplayName({ providerName: null, email: 'lena@example.com' })).toBe('Lena');
    expect(
      deriveDisplayName({ providerName: null, email: 'lena.schmidt1990@example.com' }),
    ).toBe('Lena');
    expect(deriveDisplayName({ providerName: null, email: '1234@example.com' })).toBe('Member');
    expect(deriveDisplayName({ providerName: null, email: null })).toBe('Member');
  });
});

describe('safeNextPath', () => {
  it('allows in-app paths', () => {
    expect(safeNextPath('/plans/abc?join=1')).toBe('/plans/abc?join=1');
  });

  it('rejects anything that could leave the app', () => {
    for (const next of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '',
      null,
    ]) {
      expect(safeNextPath(next)).toBe('/home');
    }
  });
});
