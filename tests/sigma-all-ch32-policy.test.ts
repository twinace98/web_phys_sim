// Σ checks for Ch 32 (materials at T ≥ T_C is slow): policy D digits.
import { sigmaSuites } from './sigma-all.shared';

sigmaSuites((m) => m.ch === 32, { policy: true });
