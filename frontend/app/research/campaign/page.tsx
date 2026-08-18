import { CampaignArena } from "@/components/research/campaign-arena"

export default async function CampaignResearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const campaignId = typeof params.campaignId === "string" ? params.campaignId : ""
  const teracSubmissionId =
    typeof params.teracSubmissionId === "string"
      ? params.teracSubmissionId
      : typeof params.submissionId === "string"
        ? params.submissionId
        : null
  return <CampaignArena campaignId={campaignId} teracSubmissionId={teracSubmissionId} />
}
