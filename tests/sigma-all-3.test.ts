// Σ checks, shard 3 of 4 (tests/sigma-all.shared.ts).
import { shard, sigmaSuites } from './sigma-all.shared';

sigmaSuites(shard(2));
