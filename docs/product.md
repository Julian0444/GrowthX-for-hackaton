# Product: Growth Atlas

Growth Atlas helps growth, go-to-market and developer relations teams investigate developer events before committing time or participation budget. Its current focus is San Francisco: a company brief leads to source research, organizer background, an event comparison and a decision brief that preserves the reasons and unanswered questions.

The product is a working prototype. The research-to-decision workflow exists; customer adoption, willingness to pay and improved commercial outcomes remain hypotheses to test. See the [current verification report](verification.md) for what was actually exercised and what remains open.

## The problem behind the product

Customer discovery shaped the direction toward a decision teams already make manually: whether an event can reach the right people, whether the organizer can deliver the proposed activity, and what participation will really cost. Relevant information is scattered across event pages, past editions, project galleries, sponsor materials and conversations.

The repository retains [one documented growth-team interview](research/discovery-terac-2026-09.md): manual research, gaps between promised and reported attendance, different event objectives, and the importance of organizer relationships. These are attributed observations, not verified market statistics. The team's broader conversations informed direction but are not additional documented cases in that record.

The useful question is more specific than “Which event is popular?” A team needs to know: **“What could we do here, why might it suit our goal, and what must we confirm before proceeding?”**

## Who uses it

| User | Decision supported |
|---|---|
| Developer relations lead | Investigate a workshop, technical demonstration or voluntary integration activity. |
| Growth or GTM lead | Compare audience relevance, organizer background, participation conditions and incomplete costs. |
| Founder or small team | Preserve research and explain a proposed event commitment to colleagues. |

The current brief supports four goals: **product adoption, technical feedback, hiring and awareness**. A goal can be provisional or declared by the buyer; declaring it does not establish its feasibility. The recorded interview also discusses enterprise sales, but that is not a separate goal option in the current interface.

## Example: DataBridge

DataBridge is a **fictional** data-tool company used to explain the workflow, not a customer. It helps developers connect APIs, databases and spreadsheets to dashboards or AI applications. Its illustrative brief targets developers and data engineers in SF, with a USD 15,000 participation budget and a technical-feedback goal: help ten developers connect a real source and collect feedback from five about setup, documentation and missing integrations.

Those numbers are success criteria, not achieved results. Before proposing a session, the team must investigate participants' projects, permission to provide support, exclusivity and complete costs. Another vendor's logo alone does not answer those questions.

CloudLaunch and the agent-observability examples in the demo materials are also fictional buyers. Their different budgets and goals belong to separate example briefs.

## What the prototype does

1. **Define and review a brief.** Product, audience, topics, goal, success definition, budget, dates, formats and constraints guide research. Editing and comparing again creates new evaluation context while preserving the earlier result.
2. **Discover proposed sources.** Bounded Exa searches save candidate pages and their origin. A search result is a lead for further reading, not proof that an event is suitable.
3. **Inspect evidence and background.** Supported sources can contribute dated excerpts, organizer roles, prior editions, company participation and published projects. Coverage and failed reads remain visible.
4. **Explore events in a list and map.** A usable public location can appear on the SF street map. City-only, withheld or uncertain locations stay available in the list without a fabricated venue point.
5. **Compare up to three editions.** The comparison explains potential relevance, evidence limits, costs and questions. “What to investigate first” is a research priority, not an ROI prediction or approval to spend.
6. **Record and reopen a decision.** Choose **Explore first**, **Choose**, **Discard** or **Leave pending**. Save reasons and conditions; where applicable, add an activity proposal, owner, success criteria and costs. Copy a manual brief and reopen its saved revision.

“Explore first” preserves participation as pending. An activity proposed by the team is distinct from an organizer's documented offer. Recording a decision does not contact anyone, reserve a place or execute a sponsorship.

## What makes the evidence useful

An announcement, a reported result, an inference and an unanswered question have different meanings. Growth Atlas carries those distinctions through the dossier, comparison and saved brief. It also separates an organizer from a sponsor or venue, a previous edition from a future one, and free admission from the complete participation cost.

The [reference case](../DemoPuentes/evidence/dp-01-caso-y-fuentes.md) contrasts AI Tinkerers' organizing history, Vultr's sponsorship role in Paris and Hackathons.team's recorded first-edition status. These differences change research questions, not universal organizer ratings. September 12–13, 2026 examples are now historical, not upcoming opportunities.

## Boundaries and next experiments

Source reading currently supports a limited set of domains, and access can fail. New searches can find pages the reader cannot process. Saved research can still demonstrate comparison and persistence, but it must be identified as preloaded evidence.

Next experiments: test whether buyers reach a defensible next step with less manual work, improve source coverage and validate willingness to pay. Measured outcomes, learning from repeated participation, organizer collaboration and confirmed introduction paths are later directions. A deployed learning loop, CRM and automated outreach are outside the current workflow.

For the engineering decisions behind these boundaries, read [Architecture](architecture.md). For a reproducible local evaluation, read [Local development](local-development.md).
