import { parseSearchQuery } from "./search";

//#####################################################
// Test definitions
//#####################################################
describe("parseSearchQuery", () => {
  it("should make empty query", () => {
    const query = {};
    const mongoQuery = parseSearchQuery(query);
    expect(mongoQuery).toMatchObject({});
  });

  it("should make $regex query", () => {
    const query = {
      _regex: "/test/i",
      field: "key0",
    };

    const mongoQuery = parseSearchQuery(query);

    expect(mongoQuery).toMatchObject({
      key0: {
        $regex: new RegExp("test", "i"),
      },
    });
  });

  it("should make $or query", () => {
    const query = {
      _or: [
        { _eqStr: "val0", field: "key0" },
        { _eqStr: "val1", field: "key1" },
      ],
    };

    const mongoQuery = parseSearchQuery(query);

    expect(mongoQuery).toMatchObject({
      $or: [
        { key0: "val0" },
        { key1: "val1" },
      ],
    });
  });

  it("should make $regex query within $or query", () => {
    const query = {
      _or: [
        { _regex: "/rgx0/i", field: "key0" },
        { _regex: "/rgx1/i", field: "key1" },
      ],
    };

    const mongoQuery = parseSearchQuery(query);

    expect(mongoQuery).toMatchObject({
      $or: [
        { key0: { $regex: new RegExp("rgx0", "i") } },
        { key1: { $regex: new RegExp("rgx1", "i") } },
      ],
    });
  });

  it("should make $in queries within $and query", () => {
    const query = {
      _and: [
        { _inInt: [1, 2, 3], field: "key0" },
        { _inInt: [10, 5], field: "key1" }, // eslint-disable-line @typescript-eslint/no-magic-numbers
      ],
    };

    const mongoQuery = parseSearchQuery(query);

    expect(mongoQuery).toMatchObject({
      $and: [
        { key0: { $in: [1, 2, 3] } },
        { key1: { $in: [10, 5] } }, // eslint-disable-line @typescript-eslint/no-magic-numbers
      ],
    });
  });

  it("should make value within a certain limit query", () => {
    const query = {
      _gtInt: 10,
      _lteInt: 20,
      field: "key0",
    };
    const mongoQuery = parseSearchQuery(query);

    expect(mongoQuery).toMatchObject({
      key0:
        {
          $gt: 10,
          $lte: 20,
        },
    });
  });

  it("should make $elemMatch query", () => {
    const query = {
      _elemMatch: {
        _and: [
          { _inInt: [1, 2, 4], field: "key1" },
          {
            _or: [
              { _regex: "/val2-1/i", field: "key2" },
              { _regex: "/val2-2/i", field: "key2" },
            ],
          },
        ],
      },
      field: "key0",
    };

    const mongoQuery = parseSearchQuery(query);

    expect(mongoQuery).toMatchObject({
      key0: {
        $elemMatch: {
          $and: [
            {
              key1: {
                $in: [1, 2, 4],
              },
            },
            {
              $or: [
                {
                  key2: {
                    $regex: new RegExp("val2-1", "i"),
                  },
                },
                {
                  key2: {
                    $regex: new RegExp("val2-2", "i"),
                  },
                },
              ],
            },
          ],
        },
      },
    });
  });
});
