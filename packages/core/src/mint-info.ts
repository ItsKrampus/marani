import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { address, type Address } from '@solana/kit';
import type { TokenProgramKind } from './balances.js';
import type { SolanaRpc } from './rpc.js';

export interface MintInfo {
  mint: string;
  program: TokenProgramKind;
  decimals: number;
  /** Token-2022 extension names present on the mint (empty for classic SPL). */
  extensions: string[];
  transferFeeBps: number;
  hasTransferHook: boolean;
  hasPermanentDelegate: boolean;
  hasFreezeAuthority: boolean;
}

interface ParsedMintAccount {
  owner?: string;
  data?: {
    parsed?: {
      type?: string;
      info?: {
        decimals?: number;
        freezeAuthority?: string | null;
        extensions?: Array<{ extension?: string; state?: Record<string, unknown> }>;
      };
    };
  };
}

/** Fetch and parse a mint account. Returns null when the address is not a mint. */
export async function getMintInfo(rpc: SolanaRpc, mint: string): Promise<MintInfo | null> {
  const res = await rpc.getAccountInfo(address(mint), { encoding: 'jsonParsed' }).send();
  const acc = res.value as ParsedMintAccount | null;
  const parsed = acc?.data?.parsed;
  if (!acc || parsed?.type !== 'mint' || typeof parsed?.info?.decimals !== 'number') return null;

  const owner = String(acc.owner ?? '');
  let program: TokenProgramKind;
  if (owner === TOKEN_PROGRAM_ADDRESS) program = 'token';
  else if (owner === TOKEN_2022_PROGRAM_ADDRESS) program = 'token-2022';
  else return null;

  const extensions = (parsed.info.extensions ?? [])
    .map((e) => (typeof e?.extension === 'string' ? e.extension : ''))
    .filter(Boolean);

  let transferFeeBps = 0;
  const feeExt = (parsed.info.extensions ?? []).find((e) => e?.extension === 'transferFeeConfig');
  const newer = (feeExt?.state as { newerTransferFee?: { transferFeeBasisPoints?: number } } | undefined)
    ?.newerTransferFee;
  if (typeof newer?.transferFeeBasisPoints === 'number') transferFeeBps = newer.transferFeeBasisPoints;

  const hookExt = (parsed.info.extensions ?? []).find((e) => e?.extension === 'transferHook');
  const hookProgram = (hookExt?.state as { programId?: string | null } | undefined)?.programId;

  return {
    mint,
    program,
    decimals: parsed.info.decimals,
    extensions,
    transferFeeBps,
    hasTransferHook: typeof hookProgram === 'string' && hookProgram.length > 0,
    hasPermanentDelegate: extensions.includes('permanentDelegate'),
    hasFreezeAuthority: typeof parsed.info.freezeAuthority === 'string' && parsed.info.freezeAuthority.length > 0,
  };
}

export function tokenProgramAddress(kind: TokenProgramKind): Address {
  return kind === 'token-2022' ? TOKEN_2022_PROGRAM_ADDRESS : TOKEN_PROGRAM_ADDRESS;
}
