import { EconomicsOrderDrilldown } from "#/features/economics/EconomicsDrilldowns";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <EconomicsOrderDrilldown orderId={Number(id)} />;
}
