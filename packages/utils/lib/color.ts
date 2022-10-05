const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;

/**
 * This function converts an RGB color to hex color.
 *
 * @param rgb - The red, green, blue components.
 */
function rgbToHex(
  rgb: [number, number, number],
) {
  return rgb.reduce((val, comp) => {
    let hex = comp.toString(16); // eslint-disable-line @typescript-eslint/no-magic-numbers
    hex = hex.length === 1 ? `0${hex}` : hex;

    return `${val}${hex}`;
  }, "#");
}

/**
 * This function going to generate a random RGB color based
 * on the following article:
 *
 * https://martin.ankerl.com/2009/12/09/how-to-create-random-colors-programmatically/
 *
 * @param hue - The hue in HSV color space.
 * @param saturation - The saturation in HSV color space.
 * @param value - The value in HSV color space.
 */
function getRandomRGBColor(
  hue?: number,
  saturation = 0.5, // eslint-disable-line @typescript-eslint/no-magic-numbers
  value = 0.95, // eslint-disable-line @typescript-eslint/no-magic-numbers
): [number, number, number] {
  let rgb: [number, number, number];

  const nextGoldenHue = (Math.random() + GOLDEN_RATIO_CONJUGATE) % 1;
  const nextHue = hue >= 0 ? hue : nextGoldenHue;

  /* eslint-disable @typescript-eslint/naming-convention, id-length */
  const h_i = Math.floor(nextHue * 6);
  const f = nextHue * 6 - h_i;
  const p = value * (1 - saturation);
  const q = value * (1 - f * saturation);
  const t = value * (1 - (1 - f) * saturation);

  switch (h_i) {
    case 0:
      rgb = [value, t, p];
      break;
    case 1:
      rgb = [q, value, p];
      break;
    case 2:
      rgb = [p, value, t];
      break;
    case 3:
      rgb = [p, q, value];
      break;
    case 4:
      rgb = [t, p, value];
      break;
    case 5:
      rgb = [value, p, q];
      break;
    default: break;
  }

  const NUM = 256;

  return [
    Math.floor(rgb[0] * NUM),
    Math.floor(rgb[1] * NUM),
    Math.floor(rgb[2] * NUM),
  ];
  /* eslint-enable @typescript-eslint/naming-convention, id-length */
}

/**
 * This function going to generate a random hex color based
 * on the following article:
 *
 * https://martin.ankerl.com/2009/12/09/how-to-create-random-colors-programmatically/
 *
 * @param hue - The hue in HSV color space.
 * @param saturation - The saturation in HSV color space.
 * @param value - The value in HSV color space.
 */
function getRandomHexColor(
  hue?: number,
  saturation?: number,
  value?: number,
) {
  return rgbToHex(getRandomRGBColor(hue, saturation, value));
}

//#####################################################
// Export
//#####################################################
export {
  rgbToHex,
  getRandomRGBColor,
  getRandomHexColor,
};
