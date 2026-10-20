/* Backwards-compatible entry for the superseded cosmetic refinement checks. */
if (!process.env.EDITORIAL_BASE_URL && process.env.SUMMONER_BASE_URL) process.env.EDITORIAL_BASE_URL = process.env.SUMMONER_BASE_URL;
if (!process.env.EDITORIAL_EVIDENCE_DIR && process.env.SUMMONER_QA_OUTPUT) process.env.EDITORIAL_EVIDENCE_DIR = process.env.SUMMONER_QA_OUTPUT;
require('./verify-editorial-v2.cjs');
