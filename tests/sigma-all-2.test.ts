// Σ checks, shard 2 of 4 (tests/sigma-all.shared.ts).
import { shard, sigmaSuites } from './sigma-all.shared';

sigmaSuites(shard(1));
