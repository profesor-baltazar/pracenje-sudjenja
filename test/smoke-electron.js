const { _electron } = require('playwright-core');
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: [process.env.TM_APP || '.', '--no-sandbox'] });
  const w = await app.firstWindow(); const errs = [];
  w.on('pageerror', e => errs.push(e.message)); w.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await w.locator('text=Pristupni podaci').or(w.locator('text=Praćenje suđenja')).first().waitFor({ timeout: 20000 });
  if (await w.$('text=Pristupni podaci')) {
    const inputs = await w.$$('input');
    await inputs[0].fill('projekat-test'); await inputs[1].fill('AIzaSyDUMMYKEYDUMMYKEYDUMMYKEY12345678');
    await w.click('text=Sačuvaj');
    await w.waitForSelector('text=Praćenje suđenja', { timeout: 10000 });
  }
  await w.click('text=Novi korisnik? Registrujte se');
  await w.waitForSelector('text=Ponovite lozinku');
  if (process.argv[2]) await w.screenshot({ path: process.argv[2] });
  console.log('OK (' + (process.env.TM_APP || 'izvorni kod') + '); lang=' + await w.evaluate(() => navigator.language) + '; errors=' + JSON.stringify(errs));
  await app.close();
})().catch(e => { console.error('SMOKE FAIL', e.message); process.exit(1); });
