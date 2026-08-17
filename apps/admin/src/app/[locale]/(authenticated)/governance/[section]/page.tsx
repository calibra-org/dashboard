import { notFound } from "next/navigation";

import { GovernanceWorkspace, type GovernanceSection } from "#/features/governance/GovernanceWorkspace";

const allowed = new Set<GovernanceSection>(["overview", "policies", "approvals", "agents", "ledger", "shadow"]);

export default async function GovernanceSectionPage({ params }: { params: Promise<{ section: string }> }) {
    const { section } = await params;
    if (!allowed.has(section as GovernanceSection)) notFound();
    return <GovernanceWorkspace section={section as GovernanceSection} />;
}
