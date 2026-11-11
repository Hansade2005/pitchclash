// Puts the APEX CLASH icon and version details into the packaged .exe (pure JS, works on Linux and Windows).
import { readFileSync, writeFileSync } from 'node:fs';
import * as ResEdit from 'resedit';
const [exePath, icoPath, version] = process.argv.slice(2);
const exe = ResEdit.NtExecutable.from(readFileSync(exePath)), res = ResEdit.NtExecutableResource.from(exe);
const icons = ResEdit.Data.IconFile.from(readFileSync(icoPath)).icons.map(i => i.data);
for (const g of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, icons);
const info = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (info) {
  const [a = 1, b = 0, c = 0] = version.split('.').map(Number);
  info.setFileVersion(a, b, c, 0, 1033); info.setProductVersion(a, b, c, 0, 1033);
  info.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'APEX CLASH', FileDescription: 'APEX CLASH', CompanyName: 'Anye Happiness Ade', LegalCopyright: 'Copyright (c) 2026 Anye Happiness Ade, Cameroon - AI Engineer', OriginalFilename: 'APEX CLASH.exe', InternalName: 'APEX CLASH' });
  info.outputToResourceEntries(res.entries);
}
res.outputResource(exe); writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('icon + version set on', exePath);
