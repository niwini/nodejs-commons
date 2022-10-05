/* eslint-disable import/prefer-default-export */

/**
 * This type is used to modify thrift types to match
 * what going to be retrieved from mongodb.
 */
export type Modify<TTypeA, TTypeB> = Pick<TTypeA, Exclude<keyof TTypeA, keyof TTypeB>> & TTypeB; // eslint-disable-line max-len

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

export type RequireFields<T, TKeys extends keyof T>
  = Omit<T, TKeys> & Required<Pick<T, TKeys>>;

/**
 * Following code for deep required got from:
 *
 * https://stackoverflow.com/questions/57835286/deep-recursive-requiredt-on-specific-properties
 */
export type Shift<T extends any[]> = ((...args: T) => any) extends ((
  first: any,
  ...rest: infer Rest
) => any)
  ? Rest
  : never;

type ShiftUnion<T> = T extends any[] ? Shift<T> : never;

/* eslint-disable @typescript-eslint/indent, @typescript-eslint/no-magic-numbers */
export type DeepRequiredForProps<T1, T2 extends string[]> = T1 extends object
  ? (Omit<T1, Extract<keyof T1, T2[0]>> &
      Required<
        {
          [K in Extract<keyof T1, T2[0]>]: NonNullable<
          DeepRequiredForProps<T1[K], ShiftUnion<T2>>
          >
        }
      >)
  : T1;

export type DeepRequired<T> = {
  [K in keyof T]: DeepRequired<T[K]>
} & Required<T>;
/* eslint-enable @typescript-eslint/indent, @typescript-eslint/no-magic-numbers */
