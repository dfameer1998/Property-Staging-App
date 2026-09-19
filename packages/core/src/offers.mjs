const normalized = s => typeof s === 'string' ? s.trim().toLowerCase() : '';
export function productRelation(a,b) {
  const exactId = (a?.gtin && b?.gtin && a.gtin===b.gtin) ||
    (normalized(a?.brand) && normalized(a?.model) && normalized(a.brand)===normalized(b?.brand) && normalized(a.model)===normalized(b?.model));
  if(!exactId) return {relation:'alternative',reason:'Exact product identity was not established.'};
  const fields=['finish','size','configuration','condition','packCount'];
  if(fields.some(k=>a[k]==null||b[k]==null||String(a[k]).trim()===''||String(b[k]).trim()==='')) return {relation:'unverified',reason:'Variant information is incomplete.'};
  if(fields.some(k=>normalized(String(a[k]))!==normalized(String(b[k])))) return {relation:'alternative',reason:'Variant, condition, or bundle differs.'};
  if(!a.identityEvidenceId||!b.identityEvidenceId) return {relation:'unverified',reason:'Product identity evidence is missing.'};
  return {relation:'same_product',reason:'Identifiers and declared variant fields match the supplied evidence.'};
}
const money=(n)=>Number.isSafeInteger(n)&&n>=0;
export function assessOffer(offer,{quantity=1,now,maxAgeMs,deadline=null,destinationKey}) {
  if(!Number.isSafeInteger(quantity)||quantity<1||!Number.isFinite(now)||!Number.isFinite(maxAgeMs)||maxAgeMs<0||!destinationKey) throw new TypeError('Invalid comparison context.');
  if(deadline!==null&&!Number.isFinite(Date.parse(deadline))) throw new TypeError('Invalid deadline.');
  if(!offer?.id || !money(offer.unitPriceMinor) || !/^[A-Z]{3}$/.test(offer.currency)) throw new TypeError('Invalid offer price.');
  const time=Date.parse(offer.checkedAt);
  if(!Number.isFinite(time)) throw new TypeError('Offer timestamp is required.');
  const reasons=[];
  if(time>now || now-time>maxAgeMs) reasons.push('Refresh offer.');
  if(!offer.sourceUrl?.startsWith('https://')) reasons.push('Verify offer source.');
  if(offer.destinationKey!==destinationKey) reasons.push('Check price and delivery for this destination.');
  if(!Number.isSafeInteger(offer.availableQuantity)||offer.availableQuantity<quantity) reasons.push('Confirm requested quantity is available.');
  const missing=[];
  let total=offer.unitPriceMinor*quantity;
  for(const field of ['shippingMinor','taxMinor','feesMinor']) {
    if(offer[field]==null) missing.push(field);
    else if(!money(offer[field])) throw new TypeError(`Invalid ${field}.`);
    else total+=offer[field];
  }
  if(!Number.isSafeInteger(total)) throw new TypeError('Offer total exceeds safe numeric range.');
  const delivery=offer.deliveryLatest ? Date.parse(offer.deliveryLatest) : NaN;
  if(offer.deliveryLatest&&!Number.isFinite(delivery)) throw new TypeError('Invalid delivery date.');
  if(deadline && (!Number.isFinite(delivery)||delivery>Date.parse(deadline))) reasons.push('Delivery is unconfirmed or later than the deadline.');
  return {offerId:offer.id,currency:offer.currency,knownSubtotalMinor:total,
    totalMinor:missing.length?null:total,missingCharges:missing,eligible:reasons.length===0,reasons};
}
export function compareOffers(offers, context) {
  const ids=offers.map(o=>o.id);
  if(new Set(ids).size!==ids.length) throw new TypeError('Duplicate offer identifiers.');
  const assessed=offers.map(o=>assessOffer(o,context));
  const currencies=[...new Set(assessed.map(o=>o.currency))];
  return currencies.map(currency=>{
    const rows=assessed.filter(o=>o.currency===currency).sort((a,b)=>{
      const ar=a.eligible&&a.totalMinor!==null,br=b.eligible&&b.totalMinor!==null;
      if(ar!==br) return ar?-1:1;
      return ar?a.totalMinor-b.totalMinor:0;
    });
    const best=rows.find(o=>o.eligible&&o.totalMinor!==null);
    return {currency,rows,lowestCompleteOfferId:best?.offerId??null,
      allOffersComparable:rows.length>0&&rows.every(o=>o.eligible&&o.totalMinor!==null),
      scope:'Supplied offers only; caller must group identical product variants before comparison.'};
  });
}
