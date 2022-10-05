//#####################################################
// Imports
//#####################################################
import bcrypt from "bcryptjs";

//#####################################################
// Types
//#####################################################
interface IComparePasswordArgs {
  password: string;
  hashedPassword: string;
}

//#####################################################
// Constants
//#####################################################
const SALT_WORK_FACTOR = 10;

//#####################################################
// Methods
//#####################################################
/**
 * This function compares a raw password and a hashed password to
 * see if both matches.
 *
 * @param args - The arguments object.
 * @param args.password - The raw password as entered by the user.
 * @param args.hashedPassword - The hashed password as stored in db.
 */
async function comparePassword(
  args: IComparePasswordArgs,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    bcrypt.compare(args.password, args.hashedPassword, (error, match) => {
      if (error) {
        return reject(error);
      }

      return resolve(match);
    });
  });
}

/**
 * This function hashes a password.
 *
 * @param value - The value to be hashed.
 * @param traceInfo - The trace info.
 */
async function hashPassword(
  value = "",
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // We use a bcrypt algorithm (see http://en.wikipedia.org/wiki/Bcrypt).
    bcrypt.genSalt(SALT_WORK_FACTOR, (error, salt) => {
      if (error) {
        return reject(error);
      }

      // Hash with generated salt.
      return bcrypt.hash(value, salt, (error1, hash) => {
        if (error1) {
          return reject(error1);
        }

        return resolve(hash);
      });
    });
  });
}

//#####################################################
// Export
//#####################################################
export {
  comparePassword,
  hashPassword,
  IComparePasswordArgs,
};
