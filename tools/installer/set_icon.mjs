// Replaces the Electron icon inside "Pitch Clash.exe" and fills in version info. Pure JS (resedit) — no Wine needed.
import fs from 'fs';
import * as ResEdit from 'resedit';
const [exePath, icoPath, version] = process.argv.slice(2);
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
const res = ResEdit.NtExecutableResource.from(exe);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
if (!groups.length) throw new Error('no icon group in exe');
for (const g of groups) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, iconFile.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) {
  const v = version.split('.').map(Number); while (v.length < 4) v.push(0);
  vi.setFileVersion(v[0], v[1], v[2], v[3], 1033); vi.setProductVersion(v[0], v[1], v[2], v[3], 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'Pitch Clash', FileDescription: 'Pitch Clash', CompanyName: 'Pitch Clash Studios', LegalCopyright: '(c) Pitch Clash Studios', OriginalFilename: 'Pitch Clash.exe', InternalName: 'Pitch Clash' });
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('icon + version info patched:', exePath, '(' + groups.length + ' icon group(s))');
