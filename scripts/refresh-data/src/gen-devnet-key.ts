// Throwaway devnet test key generator (gitignored output).
import { newMnemonic, signerFromMnemonic } from '@marani/core';
import { writeFileSync } from 'node:fs';
const out = process.argv[2] ?? '/tmp/devnet-test-key.txt';
const m = newMnemonic();
const s = await signerFromMnemonic(m);
writeFileSync(out, m);
console.log('ADDR:' + s.address);
