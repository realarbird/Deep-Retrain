/**
 * In-memory stand-ins for the Mongoose models, so route handlers can be tested
 * without MongoDB. Filters and update operators are evaluated by mingo, which
 * implements MongoDB's query language, so `$ne`, `$exists`, `$push` with
 * `$slice` and friends behave like the real thing. Ids are strings.
 */
import { Query, updateOne as applyUpdate } from "mingo";
import mongoose from "mongoose";

type Doc = Record<string, unknown> & { _id: string };
type Filter = Record<string, unknown>;

interface Options {
  /** Field sets that must be unique, like a unique index. Documents missing the fields are skipped (partial index). */
  unique?: string[][];
}

function normalize<T>(value: T): T {
  if (value instanceof mongoose.Types.ObjectId) return String(value) as T;
  if (value instanceof Date) return new Date(value) as T;
  if (Array.isArray(value)) return value.map(normalize) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out as T;
  }
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

class FakeQuery<T> implements PromiseLike<T> {
  private opts: { sort?: Record<string, 1 | -1>; limit?: number } = {};
  constructor(private run: (opts: { sort?: Record<string, 1 | -1>; limit?: number }) => T) {}
  select() {
    return this;
  }
  lean() {
    return this;
  }
  sort(sort: Record<string, 1 | -1>) {
    this.opts.sort = sort;
    return this;
  }
  limit(n: number) {
    this.opts.limit = n;
    return this;
  }
  then<A = T, B = never>(onFulfilled?: ((value: T) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return new Promise<T>((resolve) => resolve(this.run(this.opts))).then(onFulfilled, onRejected);
  }
}

function compare(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x === y) return 0;
  if (x === undefined || x === null) return -1;
  if (y === undefined || y === null) return 1;
  return (x as number) < (y as number) ? -1 : 1;
}

export class FakeModel {
  docs: Doc[] = [];
  constructor(
    public name: string,
    private options: Options = {},
  ) {}

  reset(docs: Record<string, unknown>[] = []) {
    this.docs = docs.map((d) => normalize({ _id: String(new mongoose.Types.ObjectId()), ...d }) as Doc);
  }

  private matching(filter: Filter): Doc[] {
    return new Query(normalize(filter)).find(this.docs).all() as Doc[];
  }

  private sorted(docs: Doc[], opts: { sort?: Record<string, 1 | -1>; limit?: number }): Doc[] {
    let out = [...docs];
    if (opts.sort) {
      const keys = Object.entries(opts.sort);
      out.sort((a, b) => {
        for (const [k, dir] of keys) {
          const c = compare(a[k], b[k]) * dir;
          if (c) return c;
        }
        return 0;
      });
    }
    if (opts.limit) out = out.slice(0, opts.limit);
    return out;
  }

  private checkUnique(doc: Doc, except?: Doc) {
    for (const fields of this.options.unique ?? []) {
      if (fields.some((f) => doc[f] === undefined || doc[f] === null)) continue;
      const clash = this.docs.find((d) => d !== except && fields.every((f) => d[f] === doc[f]));
      if (clash) throw Object.assign(new Error(`E11000 duplicate key in ${this.name}`), { code: 11000 });
    }
  }

  find(filter: Filter = {}) {
    return new FakeQuery((opts) => clone(this.sorted(this.matching(filter), opts)));
  }

  findOne(filter: Filter = {}) {
    return new FakeQuery((opts) => clone(this.sorted(this.matching(filter), opts)[0] ?? null));
  }

  findById(id: unknown) {
    return this.findOne({ _id: String(id) });
  }

  async countDocuments(filter: Filter = {}) {
    return this.matching(filter).length;
  }

  async create(input: Record<string, unknown>) {
    const doc = normalize({ _id: String(new mongoose.Types.ObjectId()), ...input }) as Doc;
    this.checkUnique(doc);
    this.docs.push(doc);
    return clone(doc);
  }

  async insertMany(inputs: Record<string, unknown>[]) {
    const out = [];
    for (const input of inputs) out.push(await this.create(input));
    return out;
  }

  private upsertDoc(filter: Filter, update: Record<string, unknown>): Doc {
    const seed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(normalize(filter))) if (!k.startsWith("$") && (typeof v !== "object" || v === null)) seed[k] = v;
    const doc = { _id: String(new mongoose.Types.ObjectId()), ...seed, ...((update.$setOnInsert as object) ?? {}) } as Doc;
    this.docs.push(doc);
    return doc;
  }

  private apply(doc: Doc, update: Record<string, unknown>) {
    const ops: Record<string, unknown> = { ...normalize(update) };
    delete ops.$setOnInsert;
    const copy = { ...doc };
    applyUpdate([copy], { _id: doc._id }, ops);
    this.checkUnique(copy as Doc, doc);
    Object.assign(doc, copy);
  }

  async updateOne(filter: Filter, update: Record<string, unknown>, opts: { upsert?: boolean } = {}) {
    let doc = this.matching(filter)[0];
    let upserted = false;
    if (!doc && opts.upsert) {
      doc = this.upsertDoc(filter, update);
      upserted = true;
    }
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    this.apply(doc, update);
    return { matchedCount: upserted ? 0 : 1, modifiedCount: 1, upsertedCount: upserted ? 1 : 0 };
  }

  async updateMany(filter: Filter, update: Record<string, unknown>) {
    const docs = this.matching(filter);
    for (const doc of docs) this.apply(doc, update);
    return { matchedCount: docs.length, modifiedCount: docs.length };
  }

  findOneAndUpdate(filter: Filter, update: Record<string, unknown>, opts: { upsert?: boolean; new?: boolean } = {}) {
    return new FakeQuery(() => {
      let doc = this.matching(filter)[0];
      if (!doc && opts.upsert) doc = this.upsertDoc(filter, update);
      if (!doc) return null;
      const before = clone(doc);
      this.apply(doc, update);
      return clone(opts.new ? doc : before);
    });
  }

  async deleteMany(filter: Filter = {}) {
    const doomed = new Set(this.matching(filter));
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !doomed.has(d));
    return { deletedCount: before - this.docs.length };
  }

  async deleteOne(filter: Filter = {}) {
    const doc = this.matching(filter)[0];
    if (!doc) return { deletedCount: 0 };
    this.docs = this.docs.filter((d) => d !== doc);
    return { deletedCount: 1 };
  }

  async aggregate(): Promise<never> {
    throw new Error("aggregate is not available in the fake database");
  }
}

function createFakeDb() {
  return {
    ConceptCard: new FakeModel("ConceptCard"),
    ReviewLog: new FakeModel("ReviewLog", { unique: [["auth0Id", "attemptId"]] }),
    StudyDeck: new FakeModel("StudyDeck"),
    UserProfile: new FakeModel("UserProfile", { unique: [["auth0Id"]] }),
    reset() {
      for (const m of [this.ConceptCard, this.ReviewLog, this.StudyDeck, this.UserProfile]) m.reset();
    },
  };
}

// One instance per test file, even when `vi.resetModules()` re-imports this module.
const holder = globalThis as unknown as { __deepretainFakeDb?: ReturnType<typeof createFakeDb> };
export const fakeDb = (holder.__deepretainFakeDb ??= createFakeDb());
