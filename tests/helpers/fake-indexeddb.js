/*
 * Minimal in-memory IndexedDB for DOM-free unit tests.
 * Supports databases with several keyPath object stores and the subset used by
 * Vectura stores: put / get / delete / getAll / getAllKeys inside a transaction.
 *
 *   const idb = makeFakeIdb();
 *   idb.failPut = (store, rec) => Error | null   // throw from put (e.g. QuotaExceededError)
 *   idb.reset()                                   // empty every store
 *   idb.dump(dbName, storeName) -> Map
 *
 * Values are structured-cloned when possible (plain objects); values that
 * cannot be cloned (e.g. fake file handles with methods) are stored by reference.
 */
const clone = (v) => {
  try { return structuredClone(v); } catch (_e) { return v; }
};

const makeFakeIdb = () => {
  const dbs = new Map();
  const fake = { failPut: null, opens: 0, dbs };
  const later = (fn) => Promise.resolve().then(fn);

  fake.open = (name) => {
    fake.opens += 1;
    const req = {};
    later(() => {
      let db = dbs.get(name);
      const isNew = !db;
      if (!db) {
        const stores = new Map();
        db = {
          name,
          stores,
          objectStoreNames: { contains: (n) => stores.has(n) },
          createObjectStore: (n, o) => { stores.set(n, { keyPath: o.keyPath, data: new Map() }); },
          transaction: (names) => {
            const list = Array.isArray(names) ? names : [names];
            const tx = {};
            const reqs = [];
            const mk = (fn) => {
              const r = {};
              reqs.push(() => { r.result = fn(); if (r.onsuccess) r.onsuccess(); });
              return r;
            };
            tx.objectStore = (n) => {
              if (!list.includes(n) || !stores.has(n)) throw new Error('NotFoundError');
              const st = stores.get(n);
              return {
                put: (rec) => {
                  if (fake.failPut) {
                    const e = fake.failPut(n, rec);
                    if (e) throw e;
                  }
                  return mk(() => { st.data.set(rec[st.keyPath], clone(rec)); return rec[st.keyPath]; });
                },
                get: (k) => mk(() => (st.data.has(k) ? clone(st.data.get(k)) : undefined)),
                delete: (k) => mk(() => { st.data.delete(k); }),
                getAll: () => mk(() => Array.from(st.data.values()).map(clone)),
                getAllKeys: () => mk(() => Array.from(st.data.keys())),
              };
            };
            later(() => { reqs.forEach((f) => f()); if (tx.oncomplete) tx.oncomplete(); });
            return tx;
          },
        };
        dbs.set(name, db);
      }
      req.result = db;
      if (isNew && req.onupgradeneeded) req.onupgradeneeded();
      if (req.onsuccess) req.onsuccess();
    });
    return req;
  };
  fake.reset = () => dbs.forEach((db) => db.stores.forEach((st) => st.data.clear()));
  fake.dump = (dbName, storeName) => dbs.get(dbName).stores.get(storeName).data;
  return fake;
};

module.exports = { makeFakeIdb };
