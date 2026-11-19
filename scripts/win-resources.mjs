// Incrusta el icono y los datos de versión en dist/win-unpacked/Memora.exe
// sin necesitar Wine (resedit edita los recursos PE directamente en JavaScript).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ResEdit from 'resedit';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const exePath = path.join(root, 'dist', 'win-unpacked', 'Memora.exe');

const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);

const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'build', 'icon.ico')));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const groupId = groups.length ? groups[0].id : 1;
const lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));

const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const [a, b, c] = pkg.version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  FileDescription: 'Memora',
  ProductName: 'Memora',
  CompanyName: 'Memora',
  InternalName: 'Memora',
  OriginalFilename: 'Memora.exe',
  LegalCopyright: `Copyright © ${new Date().getFullYear()} Memora`,
  FileVersion: pkg.version,
  ProductVersion: pkg.version,
});
vi.outputToResourceEntries(res.entries);

res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log(`Icono y versión ${pkg.version} incrustados en ${path.relative(root, exePath)}`);
