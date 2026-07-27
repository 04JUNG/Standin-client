/**
 * 압축 없는(STORE) 최소 ZIP 작성기. 외부 의존성 없이 브라우저에서 여러 파일을
 * 하나의 다운로드로 묶기 위한 용도(export.mock.ts). 실제 파일 시스템 쓰기는
 * 아니므로 회전/재현이 아닌 표준 ZIP 구조만 보장한다.
 */
export type ZipFile = { name: string; content: string };

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  u16(n: number): void {
    this.push(Uint8Array.of(n & 0xff, (n >>> 8) & 0xff));
  }

  u32(n: number): void {
    this.push(Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff));
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(date.getFullYear(), 1980) - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

export function buildZip(files: ZipFile[]): Blob {
  const encoder = new TextEncoder();
  const writer = new ByteWriter();
  const { time, date } = dosDateTime(new Date());
  const central: Array<{ nameBytes: Uint8Array; crc: number; size: number; offset: number }> = [];

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const offset = writer.length;

    writer.u32(0x04034b50); // local file header signature
    writer.u16(20); // version needed
    writer.u16(0); // flags
    writer.u16(0); // method: store
    writer.u16(time);
    writer.u16(date);
    writer.u32(crc);
    writer.u32(data.length); // compressed size
    writer.u32(data.length); // uncompressed size
    writer.u16(nameBytes.length);
    writer.u16(0); // extra field length
    writer.push(nameBytes);
    writer.push(data);

    central.push({ nameBytes, crc, size: data.length, offset });
  }

  const centralStart = writer.length;
  for (const entry of central) {
    writer.u32(0x02014b50); // central directory signature
    writer.u16(20); // version made by
    writer.u16(20); // version needed
    writer.u16(0); // flags
    writer.u16(0); // method: store
    writer.u16(time);
    writer.u16(date);
    writer.u32(entry.crc);
    writer.u32(entry.size);
    writer.u32(entry.size);
    writer.u16(entry.nameBytes.length);
    writer.u16(0); // extra field length
    writer.u16(0); // comment length
    writer.u16(0); // disk number start
    writer.u16(0); // internal attributes
    writer.u32(0); // external attributes
    writer.u32(entry.offset);
    writer.push(entry.nameBytes);
  }
  const centralSize = writer.length - centralStart;

  writer.u32(0x06054b50); // end of central directory signature
  writer.u16(0); // disk number
  writer.u16(0); // disk with central directory
  writer.u16(central.length);
  writer.u16(central.length);
  writer.u32(centralSize);
  writer.u32(centralStart);
  writer.u16(0); // comment length

  return new Blob([writer.toUint8Array().buffer as ArrayBuffer], { type: "application/zip" });
}
