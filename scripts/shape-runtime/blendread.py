"""Minimal reader for uncompressed Blender 5.x .blend files (BHead format 01, LE, 64-bit)."""
import struct, re
import numpy as np


class Blend:
    def __init__(self, path):
        self.d = d = open(path, 'rb').read()
        assert d[:7] == b'BLENDER', d[:17]
        hsize = int(d[7:9])
        assert d[9:12] == b'-01' and d[12:13] == b'v', d[:17]
        pos = hsize
        self.blocks = []
        self.by_addr = {}
        while pos < len(d):
            code, sdna, old, ln, nr = struct.unpack_from('<4siQqq', d, pos)
            pos += 32
            b = dict(code=code.rstrip(b'\0').decode('latin1'), sdna=sdna, old=old, len=ln, nr=nr, off=pos)
            self.blocks.append(b)
            if old:
                self.by_addr[old] = b
            if b['code'] == 'DNA1':
                self._dna(pos)
            if b['code'] == 'ENDB':
                break
            pos += ln

    def _dna(self, p):
        d = self.d
        start = p
        align = lambda q: start + ((q - start + 3) & ~3)  # DNA sections align relative to the block
        assert d[p:p + 8] == b'SDNANAME'
        p += 8
        n, = struct.unpack_from('<i', d, p); p += 4
        names = []
        for _ in range(n):
            e = d.index(b'\0', p); names.append(d[p:e].decode()); p = e + 1
        p = align(p)
        assert d[p:p + 4] == b'TYPE'; p += 4
        n, = struct.unpack_from('<i', d, p); p += 4
        types = []
        for _ in range(n):
            e = d.index(b'\0', p); types.append(d[p:e].decode()); p = e + 1
        p = align(p)
        assert d[p:p + 4] == b'TLEN'; p += 4
        tlen = list(struct.unpack_from('<%dh' % n, d, p)); p += 2 * n
        p = align(p)
        assert d[p:p + 4] == b'STRC'; p += 4
        n, = struct.unpack_from('<i', d, p); p += 4
        self.structs = []
        for _ in range(n):
            t, nf = struct.unpack_from('<hh', d, p); p += 4
            fields = []
            off = 0
            for _ in range(nf):
                ft, fn = struct.unpack_from('<hh', d, p); p += 4
                name = names[fn]
                dims = [int(x) for x in re.findall(r'\[(\d+)\]', name)]
                count = int(np.prod(dims)) if dims else 1
                base = re.sub(r'\[.*', '', name)
                ptr = base.startswith('*') or base.startswith('(*')
                size = (8 if ptr else tlen[ft]) * count
                clean = base.lstrip('*').replace('(', '').replace(')', '').lstrip('*')
                fields.append(dict(name=clean, raw=name, type=types[ft], ptr=ptr, off=off, size=size, count=count))
                off += size
            self.structs.append(dict(type=types[t], size=tlen[t], fields={f['name']: f for f in fields}, order=fields))
        self.struct_by_type = {s['type']: i for i, s in enumerate(self.structs)}

    def struct_of(self, b):
        return self.structs[b['sdna']]

    def get(self, base, sname, field, idx=0):
        s = self.structs[self.struct_by_type[sname]]
        f = s['fields'][field]
        p = base + idx * s['size'] + f['off']
        if f['ptr']:
            return struct.unpack_from('<Q', self.d, p)[0]
        t = f['type']
        fmt = {'int': 'i', 'short': 'h', 'char': 'b', 'float': 'f', 'double': 'd', 'uchar': 'B', 'int64_t': 'q', 'uint64_t': 'Q', 'int8_t': 'b', 'uint8_t': 'B', 'int16_t': 'h', 'int32_t': 'i', 'uint32_t': 'I', 'uint16_t': 'H'}.get(t)
        if t == 'char' and f['count'] > 1:
            raw = self.d[p:p + f['count']]
            return raw.split(b'\0')[0].decode('utf8', 'replace')
        if fmt and f['count'] == 1:
            return struct.unpack_from('<' + fmt, self.d, p)[0]
        return p  # address of embedded struct/array

    def field_off(self, sname, field):
        return self.structs[self.struct_by_type[sname]]['fields'][field]['off']

    def block(self, addr):
        return self.by_addr.get(addr)

    def array(self, addr, dtype, shape=None):
        b = self.by_addr[addr]
        a = np.frombuffer(self.d, dtype=dtype, count=b['len'] // np.dtype(dtype).itemsize, offset=b['off']).copy()
        return a.reshape(shape) if shape else a

    def listbase(self, p, sname):
        first = struct.unpack_from('<Q', self.d, p)[0]
        out = []
        addr = first
        while addr:
            b = self.by_addr[addr]
            out.append(b)
            addr = self.get(b['off'], sname, 'next')
        return out
