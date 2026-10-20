/* Compatibility entry: the editorial layout has been superseded by SUM World. */
if (process.env.EDITORIAL_BASE_URL) process.env.SUM_WORLD_BASE_URL ||= process.env.EDITORIAL_BASE_URL;
if (process.env.EDITORIAL_EVIDENCE_DIR) process.env.SUM_WORLD_EVIDENCE_DIR ||= process.env.EDITORIAL_EVIDENCE_DIR;
if (process.env.EDITORIAL_QUICK) process.env.SUM_WORLD_QUICK ||= process.env.EDITORIAL_QUICK;
require('./verify-sum-world.cjs');
