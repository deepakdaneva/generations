import { cleanDetails } from './tree.service';

describe('cleanDetails', () => {
  it('trims values and drops empty fields and links', () => {
    expect(
      cleanDetails({
        name: '  Ada ',
        email: ' ',
        birth: '1815-12-10',
        socials: [
          { label: 'Instagram', value: ' @ada ' },
          { label: 'X', value: '' },
        ],
      }),
    ).toEqual({ name: 'Ada', birth: '1815-12-10', socials: [{ label: 'Instagram', value: '@ada' }] });
  });
});
