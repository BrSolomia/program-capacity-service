import kafkajs from 'kafkajs';
import { compress, uncompress } from 'snappy';

// kafkajs is CommonJS, and Node's ESM loader cannot detect `CompressionCodecs` among its named
// exports: `import { CompressionCodecs } from 'kafkajs'` type checks and then fails to load.
// Taking it off the default export is the form that survives both.
const { CompressionCodecs, CompressionTypes } = kafkajs;

/** What kafkajs hands a codec on the way out. */
type Encoder = { buffer: Buffer };

/**
 * kafkajs reads uncompressed and gzip batches and refuses the rest inside its own decoder, before
 * any handler runs — so an unregistered codec crashes the consumer instead of parking the message.
 */
export function registerCompressionCodecs(): void {
  CompressionCodecs[CompressionTypes.Snappy] = () => ({
    compress: (encoder: Encoder) => compress(encoder.buffer),
    decompress: async (buffer: Buffer) => {
      const plaintext = await uncompress(buffer, { asBuffer: true });

      // `asBuffer` rules the string out; converting keeps the type true without a cast.
      return Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
    },
  });
}
