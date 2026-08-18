import { EconomicsProductDrilldown } from "#/features/economics/EconomicsDrilldowns";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <EconomicsProductDrilldown productId={Number(id)}/>}
