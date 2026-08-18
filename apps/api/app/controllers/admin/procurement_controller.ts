import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import { recordAudit } from "#services/admin_audit_log_service";
import { phase14ProcurementService as service } from "#services/phase14_procurement_service";
import { createSupplierValidator, createPurchaseOrderValidator, transitionPurchaseOrderValidator, receivePurchaseOrderValidator } from "#validators/admin/phase14_procurement_validator";
const id=(v:unknown)=>{const x=Number(v);if(!Number.isSafeInteger(x)||x<1)throw new Exception("Invalid identifier",{status:422,code:"E_PROCUREMENT_ID"});return x};
export default class ProcurementController {
  overview(){return service.overview()} suppliers(){return service.suppliers()} purchaseOrders(){return service.purchaseOrders()} recommendations(){return service.recommendations()} health(){return service.health()}
  async createSupplier(ctx:HttpContext){const p=await ctx.request.validateUsing(createSupplierValidator);const r=await service.createSupplier(p);ctx.response.status(201);await recordAudit({ctx,action:"procurement.supplier.create",entityKind:"supplier",entityId:r.data.id,payload:{code:p.code}});return r}
  async createPurchaseOrder(ctx:HttpContext){const p=await ctx.request.validateUsing(createPurchaseOrderValidator);const r=await service.createPurchaseOrder(p,await ctx.auth.authenticate());ctx.response.status(201);await recordAudit({ctx,action:"procurement.po.create",entityKind:"purchase_order",entityId:r.data.id,payload:{supplier_id:p.supplier_id,line_count:p.lines.length}});return r}
  async transition(ctx:HttpContext){const poId=id(ctx.params.id);const p=await ctx.request.validateUsing(transitionPurchaseOrderValidator);const r=await service.transition(poId,p,await ctx.auth.authenticate());await recordAudit({ctx,action:`procurement.po.${p.status}`,entityKind:"purchase_order",entityId:poId,payload:{expected_version:p.expected_version}});return r}
  async receive(ctx:HttpContext){const poId=id(ctx.params.id);const p=await ctx.request.validateUsing(receivePurchaseOrderValidator);const r=await service.receive(poId,p,await ctx.auth.authenticate());ctx.response.status(201);await recordAudit({ctx,action:"procurement.po.receive",entityKind:"purchase_order_receipt",entityId:r.data.id,payload:{purchase_order_id:poId,line_count:p.lines.length}});return r}
}
