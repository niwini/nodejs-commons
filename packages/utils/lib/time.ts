/* eslint-disable import/prefer-default-export */

/**
 * This function stops the test for a specific amount of
 * time in milliseconds.
 *
 * @param time - Time to sleep in milliseconds.
 */
async function delay(time: number) {
  return new Promise<any>((resolve) => setTimeout(resolve, time));
}

//#####################################################
// Exports
//#####################################################
export {
  delay,
};
