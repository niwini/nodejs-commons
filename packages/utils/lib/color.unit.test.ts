import _ from "lodash";

import {
  getRandomHexColor,
} from "./color";

//#####################################################
// Test definitions
//#####################################################
describe("color util", () => {
  it("should generate a correct hex random color", () => {
    const hex = getRandomHexColor();

    expect(_.isString(hex)).toBeTruthy();
    expect(hex.length).toBe(7);
  });
});
