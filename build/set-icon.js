const fs = require('fs');
const { load } = require('./tools/node_modules/resedit/cjs.cjs');
(async () => {
const ResEdit = await load();
const [exe, ico, ver] = process.argv.slice(2);
const pe = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(pe);
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, icon.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = ver.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  CompanyName: 'CeMI', ProductName: 'Praćenje suđenja', FileDescription: 'Praćenje suđenja', InternalName: 'Pracenje sudjenja',
  OriginalFilename: 'Pracenje sudjenja.exe', LegalCopyright: '© CeMI', FileVersion: ver, ProductVersion: ver });
vi.outputToResourceEntries(res.entries);
res.outputResource(pe);
fs.writeFileSync(exe, Buffer.from(pe.generate()));
console.log('ikona i verzija postavljeni:', exe);
})().catch(e => { console.error(e); process.exit(1); });
