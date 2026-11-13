// Provjera firestore.rules na zvanicnom Firebase emulatoru (pokrece se u GitHub Actions, vidi .github/workflows/provjera.yml)
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, writeBatch } = require('firebase/firestore');

const testovi = [];
const test = (ime, fn) => testovi.push([ime, fn]);

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'pravila-test',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
  const ko = (email, verified = true) => env.authenticatedContext(email, { email, email_verified: verified }).firestore();
  const admin = () => ko('admin@x.me'), ana = () => ko('ana@x.me'), ivo = () => ko('ivo@x.me'), stranac = () => ko('niko@x.me');
  const pripremi = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c => {
      const db = c.firestore();
      await setDoc(doc(db, 'meta/bootstrap'), { by: 'admin@x.me' });
      await setDoc(doc(db, 'meta/choices'), {});
      await setDoc(doc(db, 'users/admin@x.me'), { name: 'Admin', role: 'admin' });
      await setDoc(doc(db, 'users/ana@x.me'), { name: 'Ana', role: 'monitor' });
      await setDoc(doc(db, 'users/ivo@x.me'), { name: 'Ivo', role: 'monitor' });
      await setDoc(doc(db, 'predmeti/anin'), { Title: 'Ks 1/26', _owner: 'ana@x.me' });
      await setDoc(doc(db, 'predmeti/ivin'), { Title: 'Ks 2/26', _owner: 'ivo@x.me' });
      await setDoc(doc(db, 'predmeti/stari'), { Title: 'Ks 3/26' });
      await setDoc(doc(db, 'odlaganja/o1'), { Predmet: 'anin', _owner: 'ivo@x.me' });
      await setDoc(doc(db, 'odlaganja/o2'), { Predmet: 'ivin', _owner: 'ivo@x.me' });
      await setDoc(doc(db, 'odlaganja/o3'), { Predmet: 'ivin', _owner: 'ana@x.me' });
    });
  };

  test('neprijavljen i nepotvrđen e-mail ne vide ništa', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'predmeti/anin')));
    await assertFails(getDoc(doc(ko('ana@x.me', false), 'predmeti/anin')));
  });
  test('neodobren korisnik vidi samo svoj red u korisnicima', async () => {
    await assertSucceeds(getDoc(doc(stranac(), 'users/niko@x.me')));
    await assertFails(getDoc(doc(stranac(), 'users/ana@x.me')));
    await assertFails(getDoc(doc(stranac(), 'meta/choices')));
    await assertFails(getDoc(doc(stranac(), 'predmeti/anin')));
    await assertFails(setDoc(doc(stranac(), 'predmeti/novi'), { Title: 'X', _owner: 'niko@x.me' }));
  });
  test('neodobren ne može postati administrator kad administrator postoji', async () => {
    const b = writeBatch(stranac());
    b.set(doc(stranac(), 'users/niko@x.me'), { name: 'Niko', role: 'admin' });
    b.set(doc(stranac(), 'meta/bootstrap'), { by: 'niko@x.me' });
    await assertFails(b.commit());
  });
  test('prvi korisnik praznog projekta postaje administrator', async () => {
    await env.clearFirestore();
    const db = ko('prvi@x.me'), b = writeBatch(db);
    b.set(doc(db, 'users/prvi@x.me'), { name: 'Prvi', role: 'admin' });
    b.set(doc(db, 'meta/bootstrap'), { by: 'prvi@x.me' });
    await assertSucceeds(b.commit());
    const d = ko('drugi@x.me'), b2 = writeBatch(d);
    b2.set(doc(d, 'users/drugi@x.me'), { name: 'Drugi', role: 'admin' });
    b2.set(doc(d, 'meta/bootstrap'), { by: 'drugi@x.me' });
    await assertFails(b2.commit());
  });
  test('monitor čita i mijenja sve predmete, ali ne korisnike ni podešavanja', async () => {
    await assertSucceeds(getDoc(doc(ana(), 'predmeti/ivin')));
    await assertSucceeds(updateDoc(doc(ana(), 'predmeti/ivin'), { Title: 'Ks 2/26 izmijenjen' }));
    await assertFails(setDoc(doc(ana(), 'users/ana@x.me'), { name: 'Ana', role: 'admin' }));
    await assertFails(setDoc(doc(ana(), 'meta/forms'), { json: '{}' }));
  });
  test('novi zapis nosi vlasnika: svoj da, tuđi ne', async () => {
    await assertSucceeds(setDoc(doc(ana(), 'predmeti/novi'), { Title: 'Ks 9/26', _owner: 'ana@x.me' }));
    await assertFails(setDoc(doc(ana(), 'predmeti/lazni'), { Title: 'Ks 8/26', _owner: 'ivo@x.me' }));
    await assertFails(updateDoc(doc(ana(), 'predmeti/ivin'), { _owner: 'ana@x.me' }));
    await assertFails(setDoc(doc(ana(), 'predmeti/obrisan'), { Title: 'X', _owner: 'ana@x.me', _deleted: true }));
  });
  test('monitor briše svoj predmet, ne i tuđi', async () => {
    await assertSucceeds(updateDoc(doc(ana(), 'predmeti/anin'), { _deleted: true }));
    await assertFails(updateDoc(doc(ana(), 'predmeti/ivin'), { _deleted: true }));
    await assertFails(updateDoc(doc(ana(), 'predmeti/stari'), { _deleted: true }));
  });
  test('autor predmeta briše i unose drugih monitora u svom predmetu', async () => {
    await assertSucceeds(updateDoc(doc(ana(), 'odlaganja/o1'), { _deleted: true }));
    await assertFails(updateDoc(doc(ana(), 'odlaganja/o2'), { _deleted: true }));
    await assertSucceeds(updateDoc(doc(ana(), 'odlaganja/o3'), { _deleted: true }));
  });
  test('obrisan zapis vraća samo administrator', async () => {
    await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'predmeti/anin'), { _deleted: true }));
    await assertFails(updateDoc(doc(ana(), 'predmeti/anin'), { _deleted: false }));
    await assertSucceeds(updateDoc(doc(admin(), 'predmeti/anin'), { _deleted: false }));
  });
  test('administrator briše bilo koji predmet i uređuje korisnike', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'predmeti/ivin'), { _deleted: true }));
    await assertSucceeds(updateDoc(doc(admin(), 'predmeti/stari'), { _deleted: true }));
    await assertSucceeds(setDoc(doc(admin(), 'users/nova@x.me'), { name: 'Nova', role: 'monitor' }));
    await assertSucceeds(setDoc(doc(admin(), 'meta/forms'), { json: '{}' }));
  });
  test('uklonjen korisnik gubi pristup, njegovi predmeti ostaju', async () => {
    await env.withSecurityRulesDisabled(async c => { const { deleteDoc } = require('firebase/firestore'); await deleteDoc(doc(c.firestore(), 'users/ivo@x.me')); });
    await assertFails(getDoc(doc(ivo(), 'predmeti/ivin')));
    const s = await getDoc(doc(ana(), 'predmeti/ivin'));
    if (!s.exists() || s.data()._owner !== 'ivo@x.me') throw new Error('predmet uklonjenog korisnika nije sačuvan');
  });
  test('nepoznata kolekcija je zabranjena', async () => {
    await assertFails(setDoc(doc(admin(), 'nesto/x'), { a: 1 }));
  });

  let ok = 0;
  for (const [ime, fn] of testovi) {
    try { await pripremi(); await fn(); ok++; console.log('  ✓ ' + ime); }
    catch (e) { console.log('  ✗ ' + ime + '\n    ' + (e && e.message)); }
  }
  await env.cleanup();
  console.log(`\n${ok}/${testovi.length} provjera pravila prošlo.`);
  process.exit(ok === testovi.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
