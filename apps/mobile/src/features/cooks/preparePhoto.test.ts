import { centreCrop, COOK_ASPECT } from './preparePhoto';

jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));

describe('centreCrop', () => {
  it('trims the sides of a landscape photo to 4:5', () => {
    const crop = centreCrop(4000, 3000);
    expect(crop).toEqual({ originX: 800, originY: 0, width: 2400, height: 3000 });
    expect(crop.width / crop.height).toBeCloseTo(COOK_ASPECT, 3);
  });

  it('trims the top and bottom of a tall photo to 4:5', () => {
    const crop = centreCrop(3000, 4000);
    expect(crop).toEqual({ originX: 0, originY: 125, width: 3000, height: 3750 });
  });

  it('keeps a photo that is already 4:5', () => {
    expect(centreCrop(1200, 1500)).toEqual({
      originX: 0,
      originY: 0,
      width: 1200,
      height: 1500,
    });
  });
});
