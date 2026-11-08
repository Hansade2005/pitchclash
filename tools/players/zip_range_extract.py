"""Extract selected entries from a remote zip via HTTP range requests (index.tsv from central dir)."""
import sys, re, os, struct, zlib, subprocess
url, index, outdir, pattern = sys.argv[1:5]
rx = re.compile(pattern)
for line in open(index):
    name, comp, csz, usz, lo = line.rstrip('\n').split('\t')
    if name.endswith('/') or not rx.search(name):
        continue
    comp, csz, usz, lo = int(comp), int(csz), int(usz), int(lo)
    dst = os.path.join(outdir, name)
    if os.path.exists(dst) and os.path.getsize(dst) == usz:
        continue
    end = lo + 30 + 1024 + csz
    data = subprocess.run(['curl', '-sS', '-r', f'{lo}-{end}', url], capture_output=True, check=True).stdout
    assert data[:4] == b'PK\x03\x04', name
    fl, el = struct.unpack('<HH', data[26:30])
    raw = data[30 + fl + el:30 + fl + el + csz]
    out = raw if comp == 0 else zlib.decompress(raw, -15)
    assert len(out) == usz, (name, len(out), usz)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'wb').write(out)
    print('ok', name, usz)
