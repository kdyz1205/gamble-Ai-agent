import assert from 'node:assert/strict';
import { assessJudgeability } from '../src/lib/judgeability';

let passed = 0;
function check(label: string, test: () => void) {
  test(); passed++; console.log('PASS ' + label);
}
const reps = {
  title: 'Can I do 30 push-ups in 60 seconds?',
  evidenceType: 'video',
  rules: 'Only full depth reps count, entire body visible, one uninterrupted 60-second take.',
};
check('well specified push-up video requires review, never auto settlement', () => {
  const r = assessJudgeability(reps);
  assert.equal(r.status, 'reviewable');
  assert.equal(r.category, 'fitness_repetitions');
  assert.equal(r.recommendedVerifier, 'two_pass_video_review');
  assert.equal(r.requiresHumanConfirmation, true);
  assert.equal(r.autoSettlementAllowed, false);
  assert.match(r.contractHash, /^[a-f0-9]{64}$/);
});
check('preflight fingerprint stable for identical input', () => {
  assert.equal(assessJudgeability(reps).contractHash, assessJudgeability({ ...reps }).contractHash);
});
check('changing written rules changes frozen contract fingerprint', () => {
  assert.notEqual(assessJudgeability(reps).contractHash,
    assessJudgeability({ ...reps, rules: reps.rules + ' Hands remain flat.' }).contractHash);
});
check('repetition challenge with missing standard requires clarification', () => {
  const r = assessJudgeability({ title: reps.title, evidenceType: 'video' });
  assert.equal(r.status, 'needs_clarification');
  assert(r.missingConditions.some(s => s.includes('valid-form')));
});
check('photo cannot verify an activity duration', () => {
  const r = assessJudgeability({ title: 'Do 20 squats', evidenceType: 'photo' });
  assert.equal(r.status, 'needs_clarification');
  assert(r.missingConditions.includes('continuous video proof'));
});
check('explicit short badminton target supports only AI recommendation', () => {
  const r = assessJudgeability({ title: 'Badminton first to 11 points', evidenceType: 'video' });
  assert.equal(r.status, 'reviewable');
  assert.equal(r.category, 'short_scored_match');
  assert.equal(r.autoSettlementAllowed, false);
});
check('unscored badminton proposal fails closed', () => {
  const r = assessJudgeability({ title: 'I will win at badminton', evidenceType: 'video' });
  assert.equal(r.status, 'needs_clarification');
});
check('timed hold video with agreed criterion is reviewable', () => {
  const r = assessJudgeability({ title: 'Hold a plank for 2 minutes', evidenceType: 'video',
    rules: 'One uncut 120-second view with hip and shoulders visible. Any break voids the hold.' });
  assert.equal(r.category, 'timed_hold');
  assert.equal(r.status, 'reviewable');
});
check('source-of-truth digital proof cannot be replaced by self report', () => {
  const r = assessJudgeability({ title: 'Make a GitHub commit', evidenceType: 'text' });
  assert.equal(r.category, 'digital_artifact');
  assert.equal(r.status, 'manual_only');
  assert.equal(r.recommendedVerifier, 'external_source_required');
});
check('generic video cannot be automatically accepted', () => {
  const r = assessJudgeability({ title: 'I did something amazing', evidenceType: 'video' });
  assert.equal(r.status, 'needs_clarification');
});
check('ordinary text is manual only', () => {
  const r = assessJudgeability({ title: 'Complete work', evidenceType: 'self_report' });
  assert.equal(r.status, 'manual_only');
  assert.equal(r.autoSettlementAllowed, false);
});
check('invalid bodies and oversized rules cannot silently pass', () => {
  for (const value of [null, [], { title: '' }, { title: 5 }, { title: 'x', rules: {} },
    { title: 'x', description: 'z'.repeat(4_001) }, { title: 'x'.repeat(241) }]) {
    assert.throws(() => assessJudgeability(value), TypeError);
  }
});
console.log('Judgeability preflight: ' + passed + ' checks passed');
