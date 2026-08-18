import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addResearchVote,
  ensureCampaign,
  getCampaignResults,
  setCampaignLaunch,
} from '../../lib/server/research/store.ts';

test('Terac votes select copy but never manufacture significance at tiny n', () => {
  const campaignId = `camp-test-${crypto.randomUUID()}`;
  ensureCampaign({
    id: campaignId,
    opportunityId: 'opp-1',
    title: 'Test campaign',
    variantA: 'Clear A',
    variantB: 'Clear B',
  });
  addResearchVote(campaignId, {
    submissionId: 'sub-1',
    variant: 'B',
    reason: 'More concrete.',
    calibrationPassed: true,
    createdAt: new Date().toISOString(),
  });
  const result = getCampaignResults(campaignId);
  assert.equal(result?.winner, 'B');
  assert.equal(result?.winningCopy, 'Clear B');
  assert.equal(result?.significant, false);
});

test('invalid calibration is retained for audit but excluded from valid n', () => {
  const campaignId = `camp-test-${crypto.randomUUID()}`;
  ensureCampaign({
    id: campaignId,
    opportunityId: 'opp-2',
    title: 'Calibration test',
    variantA: 'A',
    variantB: 'B',
  });
  addResearchVote(campaignId, {
    submissionId: 'sub-invalid',
    variant: 'A',
    reason: 'Did not read the check.',
    calibrationPassed: false,
    createdAt: new Date().toISOString(),
  });
  const result = getCampaignResults(campaignId);
  assert.equal(result?.nTotal, 1);
  assert.equal(result?.nValid, 0);
  assert.equal(result?.winner, null);
});

test('Linq approval changes campaign state, not research counts', () => {
  const campaignId = `camp-test-${crypto.randomUUID()}`;
  ensureCampaign({
    id: campaignId,
    opportunityId: 'opp-3',
    title: 'Launch test',
    variantA: 'A',
    variantB: 'B',
  });
  setCampaignLaunch(campaignId, {
    state: 'approved',
    chatId: 'chat-1',
    messageId: 'msg-1',
  });
  const result = getCampaignResults(campaignId);
  assert.equal(result?.launch.state, 'approved');
  assert.equal(result?.nTotal, 0);
  assert.equal(result?.nValid, 0);
});

test('reconnects a configured live Terac opportunity after a server restart', () => {
  const campaignId = `camp-test-${crypto.randomUUID()}`;
  const previousCampaign = process.env.TERAC_CAMPAIGN_ID;
  const previousProject = process.env.TERAC_PROJECT_ID;
  const previousOpportunity = process.env.TERAC_OPPORTUNITY_ID;
  process.env.TERAC_CAMPAIGN_ID = campaignId;
  process.env.TERAC_PROJECT_ID = 'project-live';
  process.env.TERAC_OPPORTUNITY_ID = 'opportunity-live';

  try {
    ensureCampaign({
      id: campaignId,
      opportunityId: 'opp-4',
      title: 'Persistent validation',
      variantA: 'A',
      variantB: 'B',
    });
    const result = getCampaignResults(campaignId);
    assert.equal(result?.terac?.projectId, 'project-live');
    assert.equal(result?.terac?.opportunityId, 'opportunity-live');
    assert.equal(result?.terac?.status, 'active');
  } finally {
    if (previousCampaign == null) delete process.env.TERAC_CAMPAIGN_ID;
    else process.env.TERAC_CAMPAIGN_ID = previousCampaign;
    if (previousProject == null) delete process.env.TERAC_PROJECT_ID;
    else process.env.TERAC_PROJECT_ID = previousProject;
    if (previousOpportunity == null) delete process.env.TERAC_OPPORTUNITY_ID;
    else process.env.TERAC_OPPORTUNITY_ID = previousOpportunity;
  }
});
